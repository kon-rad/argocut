import { existsSync } from "node:fs";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { appSettings, brandAssets, brands, db } from "@/db";
import type {
	Brand,
	BrandAsset,
	BrandAssetKind,
	BrandTokens,
	BrandWithStatus,
	CreateBrandInput,
	ImportBrandInput,
	UpdateBrandInput,
} from "../types";
import { slugify } from "../types";
import {
	BrandFolderError,
	assertDirectory,
	findAssetsDir,
	findStyleGuide,
	folderName,
	parseTokens,
	readStyleGuide,
	resolveWithinRoot,
	scaffoldBrandFolder,
	scanAssets,
	validateRootPath,
	writeStyleGuide,
} from "./folder";

/**
 * Brands in Postgres, their contents on disk.
 *
 * Each function that returns a brand rescans nothing by default — reading is
 * cheap and a scan is not. `rescanBrand` is the explicit refresh, and it also
 * runs on create, import and select, which is where a stale index would
 * actually be noticed.
 */

const ACTIVE_BRAND_KEY = "active_brand_id";

function rowToAsset(row: typeof brandAssets.$inferSelect): BrandAsset {
	return {
		id: row.id,
		brandId: row.brandId,
		kind: row.kind as BrandAssetKind,
		name: row.name,
		relPath: row.relPath,
		mime: row.mime,
		size: row.size,
		width: row.width,
		height: row.height,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function rowToBrand({
	row,
	assets,
}: {
	row: typeof brands.$inferSelect;
	assets: BrandAsset[];
}): Brand {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		description: row.description,
		rootPath: row.rootPath,
		styleGuidePath: row.styleGuidePath,
		assetsDir: row.assetsDir,
		tokens: (row.tokens as BrandTokens | null) ?? null,
		lastScannedAt: row.lastScannedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		assets,
	};
}

/**
 * Whether the folder is still there. A brand whose drive was unplugged should
 * say so in the UI rather than silently showing an empty asset list.
 */
function withStatus({ brand }: { brand: Brand }): BrandWithStatus {
	const rootExists = existsSync(brand.rootPath);
	let hasStyleGuide = false;
	if (rootExists) {
		try {
			hasStyleGuide = existsSync(
				resolveWithinRoot({
					rootPath: brand.rootPath,
					relPath: brand.styleGuidePath,
				}),
			);
		} catch {
			hasStyleGuide = false;
		}
	}
	return { ...brand, rootExists, hasStyleGuide };
}

async function assetsFor({
	brandIds,
}: {
	brandIds: string[];
}): Promise<Map<string, BrandAsset[]>> {
	const byBrand = new Map<string, BrandAsset[]>();
	if (brandIds.length === 0) return byBrand;

	const rows = await db
		.select()
		.from(brandAssets)
		.where(inArray(brandAssets.brandId, brandIds))
		.orderBy(asc(brandAssets.kind), asc(brandAssets.relPath));

	for (const row of rows) {
		const list = byBrand.get(row.brandId) ?? [];
		list.push(rowToAsset(row));
		byBrand.set(row.brandId, list);
	}
	return byBrand;
}

export async function listBrands(): Promise<BrandWithStatus[]> {
	const rows = await db.select().from(brands).orderBy(asc(brands.name));
	const byBrand = await assetsFor({ brandIds: rows.map((row) => row.id) });
	return rows.map((row) =>
		withStatus({
			brand: rowToBrand({ row, assets: byBrand.get(row.id) ?? [] }),
		}),
	);
}

export async function getBrand({
	id,
}: {
	id: string;
}): Promise<BrandWithStatus | null> {
	const [row] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
	if (!row) return null;
	const byBrand = await assetsFor({ brandIds: [row.id] });
	return withStatus({
		brand: rowToBrand({ row, assets: byBrand.get(row.id) ?? [] }),
	});
}

/** Slugs are how a skill or agent names a brand, so they must not collide. */
async function uniqueSlug({
	name,
	exceptId,
}: {
	name: string;
	exceptId?: string;
}): Promise<string> {
	const base = slugify({ name });
	const taken = new Set(
		(await db.select({ slug: brands.slug, id: brands.id }).from(brands))
			.filter((row) => row.id !== exceptId)
			.map((row) => row.slug),
	);
	if (!taken.has(base)) return base;
	for (let suffix = 2; suffix < 500; suffix += 1) {
		const candidate = `${base}-${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${base}-${nanoid(6).toLowerCase()}`;
}

/**
 * Refresh the asset index from disk.
 *
 * The folder is authoritative, so this replaces rather than merges: a file
 * deleted on disk must disappear from the index, and a merge would keep it
 * forever. Ids are re-minted per scan, which is fine because nothing durable
 * references an asset id — assets are addressed by `relPath`.
 */
export async function rescanBrand({
	id,
}: {
	id: string;
}): Promise<BrandWithStatus | null> {
	const [row] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
	if (!row) return null;

	if (!existsSync(row.rootPath)) {
		// Missing folder is reported, not treated as "no assets" — wiping the index
		// because a drive was unplugged would lose the record of what is there.
		const byBrand = await assetsFor({ brandIds: [row.id] });
		return withStatus({
			brand: rowToBrand({ row, assets: byBrand.get(row.id) ?? [] }),
		});
	}

	const scanned = await scanAssets({
		rootPath: row.rootPath,
		assetsDir: row.assetsDir,
	});
	const tokens = parseTokens({
		markdown: await readStyleGuide({
			rootPath: row.rootPath,
			styleGuidePath: row.styleGuidePath,
		}),
	});

	await db.transaction(async (tx) => {
		await tx.delete(brandAssets).where(eq(brandAssets.brandId, id));
		if (scanned.length > 0) {
			await tx.insert(brandAssets).values(
				scanned.map((asset) => ({
					id: nanoid(),
					brandId: id,
					kind: asset.kind,
					name: asset.name,
					relPath: asset.relPath,
					mime: asset.mime,
					size: asset.size,
					width: asset.width,
					height: asset.height,
				})),
			);
		}
		await tx
			.update(brands)
			.set({ tokens, lastScannedAt: new Date(), updatedAt: new Date() })
			.where(eq(brands.id, id));
	});

	return await getBrand({ id });
}

export async function createBrand({
	input,
}: {
	input: CreateBrandInput;
}): Promise<BrandWithStatus> {
	const name = input.name.trim();
	if (!name) throw new BrandFolderError("A brand needs a name.");

	const rootPath = await validateRootPath({ rootPath: input.rootPath });
	const assetsDir = input.assetsDir?.trim() || "assets";
	const styleGuidePath = input.styleGuidePath?.trim() || "style-guide.md";

	const [clash] = await db
		.select({ id: brands.id, name: brands.name })
		.from(brands)
		.where(eq(brands.rootPath, rootPath))
		.limit(1);
	if (clash) {
		throw new BrandFolderError(
			`"${clash.name}" already uses that folder. Open it instead of creating a second brand over the same files.`,
		);
	}

	await scaffoldBrandFolder({
		rootPath,
		name,
		assetsDir,
		styleGuidePath,
		styleGuide: input.styleGuide,
	});

	const id = nanoid();
	await db.insert(brands).values({
		id,
		name,
		slug: await uniqueSlug({ name }),
		description: input.description?.trim() || null,
		rootPath,
		styleGuidePath,
		assetsDir,
	});

	const brand = await rescanBrand({ id });
	if (!brand) throw new BrandFolderError("Brand vanished immediately after creation");
	return brand;
}

/**
 * Adopt a folder that already exists, guessing its shape.
 *
 * Import differs from create in exactly one way: it never writes to the folder.
 * A brand you already maintain by hand should survive being pointed at.
 */
export async function importBrand({
	input,
}: {
	input: ImportBrandInput;
}): Promise<BrandWithStatus> {
	const rootPath = await validateRootPath({ rootPath: input.rootPath });
	await assertDirectory({ path: rootPath });

	const [existing] = await db
		.select()
		.from(brands)
		.where(eq(brands.rootPath, rootPath))
		.limit(1);
	if (existing) {
		// Re-importing a known folder is a rescan, not an error.
		const rescanned = await rescanBrand({ id: existing.id });
		if (rescanned) return rescanned;
	}

	const name = input.name?.trim() || folderName({ rootPath });
	const id = nanoid();

	await db.insert(brands).values({
		id,
		name,
		slug: await uniqueSlug({ name }),
		rootPath,
		styleGuidePath: (await findStyleGuide({ rootPath })) ?? "style-guide.md",
		assetsDir: await findAssetsDir({ rootPath }),
	});

	const brand = await rescanBrand({ id });
	if (!brand) throw new BrandFolderError("Brand vanished immediately after import");
	return brand;
}

export async function updateBrand({
	id,
	input,
}: {
	id: string;
	input: UpdateBrandInput;
}): Promise<BrandWithStatus | null> {
	const [row] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
	if (!row) return null;

	const name = input.name?.trim();
	await db
		.update(brands)
		.set({
			...(name ? { name, slug: await uniqueSlug({ name, exceptId: id }) } : {}),
			...(input.description !== undefined
				? { description: input.description.trim() || null }
				: {}),
			...(input.styleGuidePath?.trim()
				? { styleGuidePath: input.styleGuidePath.trim() }
				: {}),
			...(input.assetsDir?.trim() ? { assetsDir: input.assetsDir.trim() } : {}),
			updatedAt: new Date(),
		})
		.where(eq(brands.id, id));

	// The assets directory may have moved, so the index is stale either way.
	return await rescanBrand({ id });
}

/**
 * Forget a brand. The folder on disk is deliberately left alone.
 *
 * Removing a brand is an app-level bookkeeping action; the user's logos and
 * style guide are their own files, and an app that deletes them because a row
 * was removed is an app you cannot trust with a folder path.
 */
export async function deleteBrand({ id }: { id: string }): Promise<boolean> {
	const active = await getActiveBrandId();
	if (active === id) await setActiveBrandId({ id: null });

	const deleted = await db
		.delete(brands)
		.where(eq(brands.id, id))
		.returning({ id: brands.id });
	return deleted.length > 0;
}

export async function getActiveBrandId(): Promise<string | null> {
	const [row] = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, ACTIVE_BRAND_KEY))
		.limit(1);
	const value = row?.value;
	return typeof value === "string" ? value : null;
}

export async function setActiveBrandId({
	id,
}: {
	id: string | null;
}): Promise<void> {
	if (id === null) {
		await db.delete(appSettings).where(eq(appSettings.key, ACTIVE_BRAND_KEY));
		return;
	}
	await db
		.insert(appSettings)
		.values({ key: ACTIVE_BRAND_KEY, value: id })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: id, updatedAt: new Date() },
		});
}

/**
 * The active brand, rescanned. Selecting a brand is exactly the moment a stale
 * asset list would mislead, so it is the moment worth paying for a scan.
 */
export async function selectBrand({
	id,
}: {
	id: string;
}): Promise<BrandWithStatus | null> {
	const brand = await getBrand({ id });
	if (!brand) return null;
	await setActiveBrandId({ id });
	return (await rescanBrand({ id })) ?? brand;
}

export async function getActiveBrand(): Promise<BrandWithStatus | null> {
	const id = await getActiveBrandId();
	return id ? await getBrand({ id }) : null;
}

export async function readBrandStyleGuide({
	id,
}: {
	id: string;
}): Promise<{ content: string | null; path: string } | null> {
	const brand = await getBrand({ id });
	if (!brand) return null;
	return {
		path: brand.styleGuidePath,
		content: await readStyleGuide({
			rootPath: brand.rootPath,
			styleGuidePath: brand.styleGuidePath,
		}),
	};
}

export async function saveBrandStyleGuide({
	id,
	content,
}: {
	id: string;
	content: string;
}): Promise<BrandWithStatus | null> {
	const brand = await getBrand({ id });
	if (!brand) return null;

	await writeStyleGuide({
		rootPath: brand.rootPath,
		styleGuidePath: brand.styleGuidePath,
		content,
	});

	// Front matter may have changed, and tokens are read from it.
	await db
		.update(brands)
		.set({ tokens: parseTokens({ markdown: content }), updatedAt: new Date() })
		.where(eq(brands.id, id));

	return await getBrand({ id });
}

export async function getBrandAsset({
	brandId,
	assetId,
}: {
	brandId: string;
	assetId: string;
}): Promise<{ absolutePath: string; asset: BrandAsset } | null> {
	const [row] = await db
		.select()
		.from(brandAssets)
		.where(and(eq(brandAssets.id, assetId), eq(brandAssets.brandId, brandId)))
		.limit(1);
	if (!row) return null;

	const [brand] = await db
		.select({ rootPath: brands.rootPath })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!brand) return null;

	return {
		asset: rowToAsset(row),
		absolutePath: resolveWithinRoot({
			rootPath: brand.rootPath,
			relPath: row.relPath,
		}),
	};
}
