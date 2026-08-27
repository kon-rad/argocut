import { and, desc, eq, sql } from "drizzle-orm";
import { db, storageDocs } from "@/db";

/**
 * Postgres-backed storage for ArgoCut editor documents.
 *
 * The split this implements: structured metadata that you list, sort and join
 * lives in Postgres; bytes and human-editable text stay on the filesystem. So
 * projects, per-project media metadata and saved sounds land here, while media
 * binaries stay in `file-store.ts` and a brand's style guide stays a `.md` in
 * the brand folder.
 *
 * The document body is stored opaquely as `jsonb`. `SerializedProject` is the
 * editor's own shape and changes whenever the timeline gains a feature; a
 * normalised schema would need a migration for each. Query what is worth
 * indexing, leave the body alone.
 *
 * The five-method `StorageAdapter` contract is unchanged, and so is the client:
 * `HttpAdapter` still talks to `/api/storage/doc/*`. Only what answers has moved.
 */

/**
 * Collection and key arrive from the client. They are parameterised values here
 * rather than path segments, so traversal is not a concern the way it is for
 * the file store — but an empty collection would silently match nothing, and a
 * caller that asked for one has a bug worth surfacing.
 */
function assertNonEmpty({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (!value) throw new Error(`Missing ${label}`);
	return value;
}

export async function getDoc<T>({
	collection,
	key,
}: {
	collection: string;
	key: string;
}): Promise<T | null> {
	assertNonEmpty({ value: collection, label: "collection" });
	assertNonEmpty({ value: key, label: "key" });

	const [row] = await db
		.select({ data: storageDocs.data })
		.from(storageDocs)
		.where(
			and(eq(storageDocs.collection, collection), eq(storageDocs.key, key)),
		)
		.limit(1);

	return row ? (row.data as T) : null;
}

export async function setDoc<T>({
	collection,
	key,
	value,
}: {
	collection: string;
	key: string;
	value: T;
}): Promise<void> {
	assertNonEmpty({ value: collection, label: "collection" });
	assertNonEmpty({ value: key, label: "key" });

	// One statement rather than a read-then-write: two windows saving the same
	// project at once must not deadlock or lose the row entirely. Last write
	// still wins on the body — see the concurrency note in the devlog.
	await db
		.insert(storageDocs)
		.values({ collection, key, data: value as never })
		.onConflictDoUpdate({
			target: [storageDocs.collection, storageDocs.key],
			set: {
				data: value as never,
				version: sql`${storageDocs.version} + 1`,
				updatedAt: new Date(),
			},
		});
}

export async function removeDoc({
	collection,
	key,
}: {
	collection: string;
	key: string;
}): Promise<void> {
	assertNonEmpty({ value: collection, label: "collection" });
	assertNonEmpty({ value: key, label: "key" });

	await db
		.delete(storageDocs)
		.where(
			and(eq(storageDocs.collection, collection), eq(storageDocs.key, key)),
		);
}

export async function listDocs({
	collection,
}: {
	collection: string;
}): Promise<string[]> {
	assertNonEmpty({ value: collection, label: "collection" });

	const rows = await db
		.select({ key: storageDocs.key })
		.from(storageDocs)
		.where(eq(storageDocs.collection, collection))
		.orderBy(desc(storageDocs.updatedAt));

	return rows.map((row) => row.key);
}

export async function getAllDocs<T>({
	collection,
}: {
	collection: string;
}): Promise<T[]> {
	assertNonEmpty({ value: collection, label: "collection" });

	const rows = await db
		.select({ data: storageDocs.data })
		.from(storageDocs)
		.where(eq(storageDocs.collection, collection))
		.orderBy(desc(storageDocs.updatedAt));

	return rows.map((row) => row.data as T);
}

export async function clearDocs({
	collection,
}: {
	collection: string;
}): Promise<void> {
	assertNonEmpty({ value: collection, label: "collection" });

	await db.delete(storageDocs).where(eq(storageDocs.collection, collection));
}
