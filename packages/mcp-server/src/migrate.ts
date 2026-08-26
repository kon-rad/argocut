#!/usr/bin/env bun
/**
 * Copy every project out of a browser profile and into server storage.
 *
 * Without this, switching NEXT_PUBLIC_STORAGE_MODE to "server" looks like all
 * previous work was deleted — it is still in the profile, just no longer where
 * the app reads from.
 *
 * Runs in the browser, through the same facade the agent uses, because IndexedDB
 * and OPFS can only be read by the page that owns them. The page reads from
 * local storage and PUTs each document and file to the server API.
 *
 * Usage:
 *   bun run packages/mcp-server/src/migrate.ts [--dry-run]
 */
import { AgentBrowser } from "./browser";
import { loadConfig } from "./config";

interface MigrationReport {
	projects: Array<{ id: string; name: string; mediaFiles: number; bytes: number }>;
	errors: string[];
}

const dryRun = process.argv.includes("--dry-run");
const config = loadConfig();
const browser = new AgentBrowser({ config });

try {
	const page = await browser.ensureStarted({ headless: true });

	const report = (await page.evaluate(async (isDryRun: boolean) => {
		const result: MigrationReport = { projects: [], errors: [] };

		const openDb = (name: string): Promise<IDBDatabase | null> =>
			new Promise((resolve) => {
				const request = indexedDB.open(name);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => resolve(null);
			});

		const readStore = <T>(db: IDBDatabase, store: string): Promise<T[]> =>
			new Promise((resolve) => {
				if (!db.objectStoreNames.contains(store)) return resolve([]);
				const request = db.transaction([store], "readonly").objectStore(store).getAll();
				request.onsuccess = () => resolve((request.result ?? []) as T[]);
				request.onerror = () => resolve([]);
			});

		const put = async (url: string, body: BodyInit, type: string) => {
			const response = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": type },
				body,
			});
			if (!response.ok) throw new Error(`${url} -> ${response.status}`);
		};

		const projectsDb = await openDb("video-editor-projects");
		if (!projectsDb) {
			result.errors.push("No local projects database found in this profile");
			return result;
		}

		const projects = await readStore<{ metadata: { id: string; name: string } }>(
			projectsDb,
			"projects",
		);

		for (const project of projects) {
			const id = project.metadata.id;
			let mediaFiles = 0;
			let bytes = 0;

			try {
				if (!isDryRun) {
					await put(
						`/api/storage/doc/projects/${encodeURIComponent(id)}`,
						JSON.stringify(project),
						"application/json",
					);
				}

				const mediaDb = await openDb(`video-editor-media-${id}`);
				if (mediaDb) {
					const assets = await readStore<{ id: string }>(mediaDb, "media-metadata");
					for (const asset of assets) {
						if (!isDryRun) {
							await put(
								`/api/storage/doc/video-editor-media-${id}/${encodeURIComponent(asset.id)}`,
								JSON.stringify(asset),
								"application/json",
							);
						}
					}
				}

				const root = await navigator.storage.getDirectory();
				const directory = await root.getDirectoryHandle(`media-files-${id}`);
				for await (const [name, handle] of directory.entries()) {
					if (handle.kind !== "file") continue;
					const file = await handle.getFile();
					bytes += file.size;
					mediaFiles += 1;
					if (!isDryRun) {
						await put(
							`/api/storage/blob/media-files-${id}/${encodeURIComponent(name)}`,
							file,
							file.type || "application/octet-stream",
						);
					}
				}
			} catch (error) {
				result.errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
			}

			result.projects.push({ id, name: project.metadata.name, mediaFiles, bytes });
		}

		return result;
	}, dryRun)) as MigrationReport;

	console.log(dryRun ? "\nDRY RUN — nothing was written\n" : "\nMigrated\n");
	for (const project of report.projects) {
		console.log(
			`  ${project.name}\n    ${project.id}\n    ${project.mediaFiles} media files, ` +
				`${(project.bytes / 1_000_000).toFixed(0)} MB`,
		);
	}
	for (const error of report.errors) {
		console.error(`  ERROR ${error}`);
	}
	console.log(
		`\n${report.projects.length} project(s). Server data dir: ` +
			`${process.env.ARGOCUT_DATA_DIR ?? "~/ArgoCut/data"}`,
	);
	process.exitCode = report.errors.length ? 1 : 0;
} finally {
	await browser.close();
}
