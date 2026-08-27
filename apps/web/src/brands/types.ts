/**
 * A brand is the container everything else is created inside.
 *
 * It is deliberately thin: a name, a folder on disk, and an index of what that
 * folder holds. The weight lives in the folder — a `style-guide.md` you can
 * edit anywhere, and an `assets/` directory you can drop files into — so a
 * brand outlives this app and can be read by any other tool or agent that knows
 * the path.
 */

export type BrandAssetKind =
	| "logo"
	| "emblem"
	| "title-card"
	| "font"
	| "image"
	| "video"
	| "other";

export const BRAND_ASSET_KINDS: BrandAssetKind[] = [
	"logo",
	"emblem",
	"title-card",
	"font",
	"image",
	"video",
	"other",
];

export interface BrandAsset {
	id: string;
	brandId: string;
	kind: BrandAssetKind;
	/** File name as it appears on disk. */
	name: string;
	/** Path relative to the brand's root folder, e.g. `assets/logo.svg`. */
	relPath: string;
	mime: string | null;
	size: number | null;
	width: number | null;
	height: number | null;
	updatedAt: string;
}

/**
 * Palette and type lifted out of the style guide's YAML front matter, when it
 * has any. Optional throughout — a style guide is prose first, and a brand
 * without front matter is still a perfectly good brand.
 */
export interface BrandTokens {
	colors?: Record<string, string>;
	fonts?: Record<string, string>;
	[key: string]: unknown;
}

export interface Brand {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	/** Absolute path to the brand folder on the machine running the server. */
	rootPath: string;
	/** Style guide markdown, relative to `rootPath`. */
	styleGuidePath: string;
	/** Asset directory, relative to `rootPath`. */
	assetsDir: string;
	tokens: BrandTokens | null;
	lastScannedAt: string | null;
	createdAt: string;
	updatedAt: string;
	assets: BrandAsset[];
}

/** A brand plus whether its folder is actually reachable right now. */
export interface BrandWithStatus extends Brand {
	/** False when the root folder has been moved, renamed or unmounted. */
	rootExists: boolean;
	hasStyleGuide: boolean;
}

export interface CreateBrandInput {
	name: string;
	rootPath: string;
	description?: string;
	styleGuidePath?: string;
	assetsDir?: string;
	/** Seed the style guide with this markdown when creating the folder. */
	styleGuide?: string;
}

export interface ImportBrandInput {
	rootPath: string;
	/** Defaults to the folder's own name. */
	name?: string;
}

export interface UpdateBrandInput {
	name?: string;
	description?: string;
	styleGuidePath?: string;
	assetsDir?: string;
}

/** Everything a workflow, skill or agent needs to act "as" a brand. */
export interface BrandContext {
	id: string;
	name: string;
	slug: string;
	rootPath: string;
	styleGuidePath: string;
	assetsDir: string;
	tokens: BrandTokens | null;
	assets: BrandAsset[];
}

export function toBrandContext({ brand }: { brand: Brand }): BrandContext {
	return {
		id: brand.id,
		name: brand.name,
		slug: brand.slug,
		rootPath: brand.rootPath,
		styleGuidePath: brand.styleGuidePath,
		assetsDir: brand.assetsDir,
		tokens: brand.tokens,
		assets: brand.assets,
	};
}

/** URL that serves an asset's bytes through the API. */
export function brandAssetUrl({
	brandId,
	assetId,
}: {
	brandId: string;
	assetId: string;
}): string {
	return `/api/brands/${encodeURIComponent(brandId)}/asset/${encodeURIComponent(assetId)}`;
}

export function slugify({ name }: { name: string }): string {
	return (
		name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || "brand"
	);
}
