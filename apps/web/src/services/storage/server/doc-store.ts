import * as fileStore from "./file-store";
import * as pgStore from "./pg-store";

/**
 * Which store answers `/api/storage/doc/*`.
 *
 * Postgres is the default: projects, media metadata and saved sounds are
 * structured records that want listing, sorting and joining against brands, and
 * that is what a database is for. The filesystem keeps what it is better at —
 * media binaries, and the markdown inside a brand folder.
 *
 * `files` remains selectable so documents written by the previous filesystem
 * store are still readable, which is what `scripts/migrate-docs-to-pg.ts` uses
 * to move them across. Blobs are unaffected either way.
 */
export type DocStoreKind = "postgres" | "files";

export function docStoreKind(): DocStoreKind {
	return process.env.ARGOCUT_DOC_STORE === "files" ? "files" : "postgres";
}

function useFiles(): boolean {
	return docStoreKind() === "files";
}

export async function getDoc<T>(args: {
	collection: string;
	key: string;
}): Promise<T | null> {
	return useFiles()
		? ((await fileStore.getDoc(args)) as T | null)
		: await pgStore.getDoc<T>(args);
}

export async function setDoc<T>(args: {
	collection: string;
	key: string;
	value: T;
}): Promise<void> {
	return useFiles() ? fileStore.setDoc(args) : pgStore.setDoc<T>(args);
}

export async function removeDoc(args: {
	collection: string;
	key: string;
}): Promise<void> {
	return useFiles() ? fileStore.removeDoc(args) : pgStore.removeDoc(args);
}

export async function listDocs(args: {
	collection: string;
}): Promise<string[]> {
	return useFiles() ? fileStore.listDocs(args) : pgStore.listDocs(args);
}

export async function getAllDocs<T>(args: {
	collection: string;
}): Promise<T[]> {
	return useFiles()
		? ((await fileStore.getAllDocs(args)) as T[])
		: await pgStore.getAllDocs<T>(args);
}

export async function clearDocs(args: {
	collection: string;
}): Promise<void> {
	return useFiles() ? fileStore.clearDocs(args) : pgStore.clearDocs(args);
}
