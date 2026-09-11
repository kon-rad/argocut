import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import {
	mkdir,
	open,
	readFile,
	readdir,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

/**
 * Server-side storage for ArgoCut projects and media.
 *
 * Plain files on disk rather than a database. For a single-user local tool that
 * is the more resilient choice: no daemon to keep running, backup is `rsync` on
 * one directory, and the documents stay human-readable when something goes
 * wrong. Postgres earns its place when there are many users to isolate, and
 * there are not.
 *
 * Layout:
 *   $ARGOCUT_DATA_DIR/
 *     doc/<collection>/<key>.json     projects, media metadata, saved sounds
 *     blob/<bucket>/<key>             media binaries
 */

export function dataDir(): string {
	return (
		process.env.ARGOCUT_DATA_DIR ??
		join(process.env.ARGOCUT_HOME ?? join(homedir(), "ArgoCut"), "data")
	);
}

/**
 * Collection, bucket and key names arrive from the client and become path
 * segments. Anything that could climb out of the data directory is rejected
 * rather than sanitised — a silently rewritten key would read back as missing.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function assertSafe({ segment, label }: { segment: string; label: string }): string {
	if (!segment || !SAFE_SEGMENT.test(segment) || segment === "." || segment === "..") {
		throw new Error(`Invalid ${label}: ${JSON.stringify(segment)}`);
	}
	return segment;
}

/**
 * Keys such as media ids are already safe, but project-scoped collection names
 * embed a uuid and file names can carry anything. Hash whatever does not pass
 * so every key remains addressable and no path escapes the root.
 */
function encodeKey({ key }: { key: string }): string {
	if (SAFE_SEGMENT.test(key) && key.length <= 120 && key !== "." && key !== "..") {
		return key;
	}
	return `k_${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
}

function docDir({ collection }: { collection: string }): string {
	return join(dataDir(), "doc", assertSafe({ segment: collection, label: "collection" }));
}

function blobDir({ bucket }: { bucket: string }): string {
	return join(dataDir(), "blob", assertSafe({ segment: bucket, label: "bucket" }));
}

function withinRoot({ path }: { path: string }): string {
	const root = resolve(dataDir());
	const target = resolve(path);
	if (target !== root && !target.startsWith(`${root}/`)) {
		throw new Error("Refusing to touch a path outside the data directory");
	}
	return target;
}

async function keyIndexPath({ dir }: { dir: string }): Promise<string> {
	return join(dir, ".keys.json");
}

/**
 * Encoded keys are not reversible, so the original key for each stored file is
 * recorded alongside it. `list()` must return what the caller stored.
 */
async function readKeyIndex({ dir }: { dir: string }): Promise<Record<string, string>> {
	try {
		return JSON.parse(await readFile(await keyIndexPath({ dir }), "utf8"));
	} catch {
		return {};
	}
}

async function writeKeyIndex({
	dir,
	index,
}: {
	dir: string;
	index: Record<string, string>;
}): Promise<void> {
	await writeFile(await keyIndexPath({ dir }), JSON.stringify(index), "utf8");
}

async function rememberKey({
	dir,
	encoded,
	key,
}: {
	dir: string;
	encoded: string;
	key: string;
}): Promise<void> {
	const index = await readKeyIndex({ dir });
	if (index[encoded] === key) return;
	index[encoded] = key;
	await writeKeyIndex({ dir, index });
}

export async function getDoc({
	collection,
	key,
}: {
	collection: string;
	key: string;
}): Promise<unknown | null> {
	const dir = docDir({ collection });
	const path = withinRoot({ path: join(dir, `${encodeKey({ key })}.json`) });
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}

export async function setDoc({
	collection,
	key,
	value,
}: {
	collection: string;
	key: string;
	value: unknown;
}): Promise<void> {
	const dir = docDir({ collection });
	await mkdir(dir, { recursive: true });
	const encoded = encodeKey({ key });
	const path = withinRoot({ path: join(dir, `${encoded}.json`) });

	// Write-then-rename: a crash mid-write leaves the previous version intact
	// rather than a truncated project file.
	const temporary = `${path}.tmp`;
	await writeFile(temporary, JSON.stringify(value), "utf8");
	await rm(path, { force: true });
	await (await import("node:fs/promises")).rename(temporary, path);
	await rememberKey({ dir, encoded, key });
}

export async function removeDoc({
	collection,
	key,
}: {
	collection: string;
	key: string;
}): Promise<void> {
	const dir = docDir({ collection });
	const encoded = encodeKey({ key });
	await rm(withinRoot({ path: join(dir, `${encoded}.json`) }), { force: true });
	const index = await readKeyIndex({ dir });
	if (encoded in index) {
		delete index[encoded];
		await writeKeyIndex({ dir, index });
	}
}

export async function listDocs({
	collection,
}: {
	collection: string;
}): Promise<string[]> {
	const dir = docDir({ collection });
	if (!existsSync(dir)) return [];
	const index = await readKeyIndex({ dir });
	const files = await readdir(dir);
	return files
		.filter((name) => name.endsWith(".json") && name !== ".keys.json")
		.map((name) => {
			const encoded = name.slice(0, -".json".length);
			return index[encoded] ?? encoded;
		});
}

export async function getAllDocs({
	collection,
}: {
	collection: string;
}): Promise<unknown[]> {
	const keys = await listDocs({ collection });
	const values = await Promise.all(
		keys.map((key) => getDoc({ collection, key })),
	);
	return values.filter((value) => value !== null);
}

export async function clearDocs({ collection }: { collection: string }): Promise<void> {
	await rm(withinRoot({ path: docDir({ collection }) }), {
		recursive: true,
		force: true,
	});
}

export async function getBlobPath({
	bucket,
	key,
}: {
	bucket: string;
	key: string;
}): Promise<{ path: string; size: number } | null> {
	const path = withinRoot({
		path: join(blobDir({ bucket }), encodeKey({ key })),
	});
	try {
		const info = await stat(path);
		return { path, size: info.size };
	} catch {
		return null;
	}
}

export async function setBlob({
	bucket,
	key,
	data,
	contentType,
}: {
	bucket: string;
	key: string;
	// Media files run to hundreds of megabytes or several gigabytes, so the
	// body is streamed straight to disk rather than buffered into an
	// ArrayBuffer first — buffering held the whole file in server memory
	// (twice, once as the fetch body and once as a Buffer copy) before a
	// single write, which is what made large uploads slow and memory-hungry.
	data: ReadableStream<Uint8Array> | null;
	contentType?: string;
}): Promise<void> {
	const dir = blobDir({ bucket });
	await mkdir(dir, { recursive: true });
	const encoded = encodeKey({ key });
	const path = withinRoot({ path: join(dir, encoded) });

	// Write-then-rename: a client disconnect or crash mid-upload leaves the
	// previous blob (or nothing) intact rather than a truncated media file.
	const temporary = `${path}.tmp`;
	if (data) {
		await pipeline(
			Readable.fromWeb(data as unknown as WebReadableStream<Uint8Array>),
			createWriteStream(temporary),
		);
	} else {
		await writeFile(temporary, Buffer.alloc(0));
	}
	await rm(path, { force: true });
	await rename(temporary, path);

	await rememberKey({ dir, encoded, key });

	// A video served as application/octet-stream will not play, so the real type
	// is recorded on write and replayed on read.
	if (contentType) {
		const types = await readTypeIndex({ dir });
		if (types[encoded] !== contentType) {
			types[encoded] = contentType;
			await writeFile(join(dir, ".types.json"), JSON.stringify(types), "utf8");
		}
	}
}

async function readTypeIndex({ dir }: { dir: string }): Promise<Record<string, string>> {
	try {
		return JSON.parse(await readFile(join(dir, ".types.json"), "utf8"));
	} catch {
		return {};
	}
}

/**
 * Magic-byte sniff for blobs stored without a recorded type.
 *
 * Media keys are uuids, so there is no extension to read, and a file that comes
 * back as application/octet-stream will not play in a video element. Files
 * migrated out of OPFS arrive typeless because the handle does not carry one.
 */
async function sniffType({ path }: { path: string }): Promise<string | null> {
	let handle;
	try {
		handle = await open(path, "r");
		const buffer = Buffer.alloc(16);
		await handle.read(buffer, 0, 16, 0);

		if (buffer.subarray(4, 8).toString("latin1") === "ftyp") {
			const brand = buffer.subarray(8, 12).toString("latin1");
			return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
		}
		if (buffer.subarray(0, 3).toString("latin1") === "ID3") return "audio/mpeg";
		if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";
		if (buffer.subarray(0, 4).toString("latin1") === "OggS") return "audio/ogg";
		if (buffer.subarray(0, 4).toString("hex") === "1a45dfa3") return "video/webm";
		if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
		if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
		if (
			buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
			buffer.subarray(8, 12).toString("latin1") === "WAVE"
		) {
			return "audio/wav";
		}
		return null;
	} catch {
		return null;
	} finally {
		await handle?.close();
	}
}

export async function getBlobType({
	bucket,
	key,
}: {
	bucket: string;
	key: string;
}): Promise<string | null> {
	const dir = blobDir({ bucket });
	const encoded = encodeKey({ key });
	const recorded = (await readTypeIndex({ dir }))[encoded];
	if (recorded && recorded !== "application/octet-stream") {
		return recorded;
	}

	const sniffed = await sniffType({ path: join(dir, encoded) });
	if (sniffed) {
		const types = await readTypeIndex({ dir });
		types[encoded] = sniffed;
		await writeFile(join(dir, ".types.json"), JSON.stringify(types), "utf8");
	}
	return sniffed;
}

export async function removeBlob({
	bucket,
	key,
}: {
	bucket: string;
	key: string;
}): Promise<void> {
	const dir = blobDir({ bucket });
	const encoded = encodeKey({ key });
	await rm(withinRoot({ path: join(dir, encoded) }), { force: true });
	const index = await readKeyIndex({ dir });
	if (encoded in index) {
		delete index[encoded];
		await writeKeyIndex({ dir, index });
	}
}

export async function listBlobs({ bucket }: { bucket: string }): Promise<string[]> {
	const dir = blobDir({ bucket });
	if (!existsSync(dir)) return [];
	const index = await readKeyIndex({ dir });
	return (await readdir(dir))
		.filter((name) => name !== ".keys.json" && name !== ".types.json")
		.map((name) => index[name] ?? name);
}

export async function clearBlobs({ bucket }: { bucket: string }): Promise<void> {
	await rm(withinRoot({ path: blobDir({ bucket }) }), {
		recursive: true,
		force: true,
	});
}
