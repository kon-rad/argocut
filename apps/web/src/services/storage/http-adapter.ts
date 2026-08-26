import type { StorageAdapter } from "./types";

/**
 * Storage backed by the ArgoCut server rather than the browser profile.
 *
 * This is what makes one project reachable from every window and every machine:
 * the browser stops being the database and becomes a client of one.
 */

const BASE = "/api/storage";

async function expectOk({
	response,
	what,
}: {
	response: Response;
	what: string;
}): Promise<void> {
	if (response.ok) return;
	let detail = response.statusText;
	try {
		const body = await response.json();
		if (body?.error) detail = String(body.error);
	} catch {
		// A non-JSON error body is not worth a second failure.
	}
	throw new Error(`${what} failed (${response.status}): ${detail}`);
}

export class HttpAdapter<T> implements StorageAdapter<T> {
	constructor(private readonly collection: string) {}

	private url(key?: string): string {
		const base = `${BASE}/doc/${encodeURIComponent(this.collection)}`;
		return key === undefined ? base : `${base}/${encodeURIComponent(key)}`;
	}

	async get(key: string): Promise<T | null> {
		const response = await fetch(this.url(key));
		if (response.status === 404) return null;
		await expectOk({ response, what: `Reading ${this.collection}/${key}` });
		return (await response.json()) as T;
	}

	async set({ key, value }: { key: string; value: T }): Promise<void> {
		const response = await fetch(this.url(key), {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(value),
		});
		await expectOk({ response, what: `Writing ${this.collection}/${key}` });
	}

	async remove(key: string): Promise<void> {
		await expectOk({
			response: await fetch(this.url(key), { method: "DELETE" }),
			what: `Deleting ${this.collection}/${key}`,
		});
	}

	async list(): Promise<string[]> {
		const response = await fetch(this.url());
		await expectOk({ response, what: `Listing ${this.collection}` });
		return (await response.json()) as string[];
	}

	async getAll(): Promise<T[]> {
		const response = await fetch(`${this.url()}?values=1`);
		await expectOk({ response, what: `Reading all of ${this.collection}` });
		return (await response.json()) as T[];
	}

	async clear(): Promise<void> {
		await expectOk({
			response: await fetch(this.url(), { method: "DELETE" }),
			what: `Clearing ${this.collection}`,
		});
	}
}

/**
 * Media binaries. `get` returns a real `File` so callers cannot tell this from
 * the OPFS adapter — the name and type are carried in headers on write and
 * reconstructed on read.
 */
export class HttpBlobAdapter implements StorageAdapter<File> {
	constructor(private readonly bucket: string) {}

	private url(key?: string): string {
		const base = `${BASE}/blob/${encodeURIComponent(this.bucket)}`;
		return key === undefined ? base : `${base}/${encodeURIComponent(key)}`;
	}

	async get(key: string): Promise<File | null> {
		const response = await fetch(this.url(key));
		if (response.status === 404) return null;
		await expectOk({ response, what: `Reading blob ${this.bucket}/${key}` });

		// OPFS names the file after its key; match that so callers cannot tell the
		// two adapters apart.
		const blob = await response.blob();
		return new File([blob], key, { type: blob.type });
	}

	async set({ key, value }: { key: string; value: File }): Promise<void> {
		const response = await fetch(this.url(key), {
			method: "PUT",
			headers: { "Content-Type": value.type || "application/octet-stream" },
			body: value,
		});
		await expectOk({ response, what: `Writing blob ${this.bucket}/${key}` });
	}

	async remove(key: string): Promise<void> {
		await expectOk({
			response: await fetch(this.url(key), { method: "DELETE" }),
			what: `Deleting blob ${this.bucket}/${key}`,
		});
	}

	async list(): Promise<string[]> {
		const response = await fetch(this.url());
		await expectOk({ response, what: `Listing blobs ${this.bucket}` });
		return (await response.json()) as string[];
	}

	async getAll(): Promise<File[]> {
		const keys = await this.list();
		const files = await Promise.all(keys.map((key) => this.get(key)));
		return files.filter((file): file is File => file !== null);
	}

	async clear(): Promise<void> {
		await expectOk({
			response: await fetch(this.url(), { method: "DELETE" }),
			what: `Clearing blobs ${this.bucket}`,
		});
	}
}

/** `server` puts every project on disk behind the API; `local` keeps the browser profile. */
export type StorageMode = "local" | "server";

export function storageMode(): StorageMode {
	return process.env.NEXT_PUBLIC_STORAGE_MODE === "server" ? "server" : "local";
}
