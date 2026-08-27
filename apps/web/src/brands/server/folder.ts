import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import type { BrandAssetKind, BrandTokens } from "../types";

/**
 * The filesystem half of a brand.
 *
 * A brand's folder lives wherever the user keeps it — not inside the app's data
 * directory — because the point of a brand folder is that other tools can read
 * it: Obsidian edits the style guide, Finder drops in a logo, a skill resolves
 * an emblem by path. The database indexes this folder; it does not own it.
 *
 * Everything here runs server-side. The browser cannot read an arbitrary path,
 * which is exactly why these are route handlers rather than client code.
 */

const MAX_SCAN_DEPTH = 4;
const MAX_ASSETS = 2000;

/**
 * Roots that would turn a scan into a crawl of the whole machine. Pointing a
 * brand at `/` is always a mistake, and finding out by waiting is unpleasant.
 */
function isRefusedRoot({ path }: { path: string }): boolean {
	const normalised = resolve(path);
	const refused = new Set([resolve("/"), resolve(homedir())]);
	return refused.has(normalised);
}

export class BrandFolderError extends Error {}

/**
 * Absolute, existing, a directory, and not somewhere absurd. Returns the
 * resolved path so callers store a canonical form rather than whatever mix of
 * symlinks and `..` was typed in.
 */
export async function validateRootPath({
	rootPath,
}: {
	rootPath: string;
}): Promise<string> {
	const trimmed = rootPath.trim();
	if (!trimmed) throw new BrandFolderError("A brand needs a folder path.");

	const expanded = trimmed.startsWith("~")
		? join(homedir(), trimmed.slice(1))
		: trimmed;

	if (!expanded.startsWith(sep)) {
		throw new BrandFolderError(
			`Give an absolute path, not "${trimmed}". A relative path means something different depending on where the server was started.`,
		);
	}

	const resolved = resolve(expanded);
	if (isRefusedRoot({ path: resolved })) {
		throw new BrandFolderError(
			`Refusing to use ${resolved} as a brand folder — scanning it would walk your whole machine. Point at a specific brand directory.`,
		);
	}
	return resolved;
}

export async function assertDirectory({
	path,
}: {
	path: string;
}): Promise<void> {
	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(path);
	} catch {
		throw new BrandFolderError(`No such folder: ${path}`);
	}
	if (!info.isDirectory()) {
		throw new BrandFolderError(`Not a folder: ${path}`);
	}
}

/**
 * Keep a relative path inside the brand root. Asset paths come back through the
 * API when serving bytes, so a crafted `relPath` must not become a file reader
 * for the rest of the disk.
 */
export function resolveWithinRoot({
	rootPath,
	relPath,
}: {
	rootPath: string;
	relPath: string;
}): string {
	const root = resolve(rootPath);
	const target = resolve(join(root, relPath));
	if (target !== root && !target.startsWith(root + sep)) {
		throw new BrandFolderError("Refusing to read outside the brand folder");
	}
	return target;
}

const FONT_EXTS = new Set([".ttf", ".otf", ".woff", ".woff2", ".eot"]);
const IMAGE_EXTS = new Set([
	".png",
	".jpg",
	".jpeg",
	".svg",
	".webp",
	".gif",
	".avif",
]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".m4v"]);

/**
 * What kind of thing this file is, from its name and where it sits.
 *
 * Name-based rather than content-based on purpose: people already name brand
 * files `logo-dark.svg` and `title-card.png`, and honouring that convention
 * means an existing folder imports correctly with no renaming. A subdirectory
 * named for a kind (`assets/logos/…`) counts as strongly as the filename.
 */
export function classifyAsset({ relPath }: { relPath: string }): BrandAssetKind {
	const ext = extname(relPath).toLowerCase();
	const haystack = relPath.toLowerCase();

	if (FONT_EXTS.has(ext)) return "font";

	const mentions = (...needles: string[]): boolean =>
		needles.some((needle) => haystack.includes(needle));

	if (mentions("title-card", "title_card", "titlecard", "lower-third", "endcard", "end-card")) {
		return "title-card";
	}
	// Logo terms are checked first because they contain the emblem ones:
	// "watermark" and "wordmark" both end in "mark", and matching that as an
	// emblem files every watermark under the wrong kind.
	if (mentions("logo", "wordmark", "watermark")) return "logo";
	// "mark" only as a whole word, for the same reason.
	if (mentions("emblem", "symbol", "favicon", "icon") || /\bmark\b/.test(haystack)) {
		return "emblem";
	}

	if (VIDEO_EXTS.has(ext)) return "video";
	if (IMAGE_EXTS.has(ext)) return "image";
	return "other";
}

const MIME_BY_EXT: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".avif": "image/avif",
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".m4v": "video/x-m4v",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".md": "text/markdown",
	".json": "application/json",
	".txt": "text/plain",
	".pdf": "application/pdf",
};

export function mimeFor({ relPath }: { relPath: string }): string | null {
	return MIME_BY_EXT[extname(relPath).toLowerCase()] ?? null;
}

/**
 * Width and height from the file header alone.
 *
 * Reading 64 bytes beats pulling in an image library for what is a convenience
 * — the picker shows "512 × 512" next to a logo. Anything unrecognised simply
 * reports nothing rather than failing the scan.
 */
export async function readDimensions({
	path,
}: {
	path: string;
}): Promise<{ width: number | null; height: number | null }> {
	const none = { width: null, height: null };
	const ext = extname(path).toLowerCase();

	try {
		if (ext === ".svg") {
			const text = (await readFile(path, "utf8")).slice(0, 4000);
			const width = Number.parseFloat(
				text.match(/\bwidth\s*=\s*["']([\d.]+)/)?.[1] ?? "",
			);
			const height = Number.parseFloat(
				text.match(/\bheight\s*=\s*["']([\d.]+)/)?.[1] ?? "",
			);
			if (Number.isFinite(width) && Number.isFinite(height)) {
				return { width: Math.round(width), height: Math.round(height) };
			}
			const viewBox = text
				.match(/\bviewBox\s*=\s*["']([^"']+)/)?.[1]
				?.trim()
				.split(/[\s,]+/);
			if (viewBox?.length === 4) {
				const w = Number.parseFloat(viewBox[2]);
				const h = Number.parseFloat(viewBox[3]);
				if (Number.isFinite(w) && Number.isFinite(h)) {
					return { width: Math.round(w), height: Math.round(h) };
				}
			}
			return none;
		}

		const buffer = await readFile(path);

		// PNG: IHDR is always the first chunk, width and height at 16 and 20.
		if (buffer.length > 24 && buffer.toString("ascii", 1, 4) === "PNG") {
			return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
		}

		// GIF: little-endian dimensions in the logical screen descriptor.
		if (buffer.length > 10 && buffer.toString("ascii", 0, 3) === "GIF") {
			return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
		}

		// WebP: VP8X carries the canvas size as two 24-bit values, minus one.
		if (
			buffer.length > 30 &&
			buffer.toString("ascii", 0, 4) === "RIFF" &&
			buffer.toString("ascii", 8, 12) === "WEBP" &&
			buffer.toString("ascii", 12, 16) === "VP8X"
		) {
			const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
			const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
			return { width, height };
		}

		// JPEG: walk the segment chain to the start-of-frame marker.
		if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
			let offset = 2;
			while (offset + 9 < buffer.length) {
				if (buffer[offset] !== 0xff) {
					offset += 1;
					continue;
				}
				const marker = buffer[offset + 1];
				// SOF0–SOF15, excluding the non-frame markers in that range.
				const isFrame =
					marker >= 0xc0 &&
					marker <= 0xcf &&
					marker !== 0xc4 &&
					marker !== 0xc8 &&
					marker !== 0xcc;
				if (isFrame) {
					return {
						height: buffer.readUInt16BE(offset + 5),
						width: buffer.readUInt16BE(offset + 7),
					};
				}
				offset += 2 + buffer.readUInt16BE(offset + 2);
			}
		}
	} catch {
		// A brand should still import when one file is unreadable.
	}
	return none;
}

export interface ScannedAsset {
	kind: BrandAssetKind;
	name: string;
	relPath: string;
	mime: string | null;
	size: number;
	width: number | null;
	height: number | null;
}

/**
 * Every asset under the brand's assets directory, recursively.
 *
 * Hidden files and the usual junk are skipped so a folder synced by Dropbox or
 * touched by macOS does not fill the picker with `.DS_Store`.
 */
export async function scanAssets({
	rootPath,
	assetsDir,
}: {
	rootPath: string;
	assetsDir: string;
}): Promise<ScannedAsset[]> {
	const assetsRoot = resolveWithinRoot({ rootPath, relPath: assetsDir });
	if (!existsSync(assetsRoot)) return [];

	const found: ScannedAsset[] = [];

	async function walk({
		dir,
		depth,
	}: {
		dir: string;
		depth: number;
	}): Promise<void> {
		if (depth > MAX_SCAN_DEPTH || found.length >= MAX_ASSETS) return;

		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (found.length >= MAX_ASSETS) return;
			if (entry.name.startsWith(".")) continue;

			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules") continue;
				await walk({ dir: full, depth: depth + 1 });
				continue;
			}
			if (!entry.isFile()) continue;

			const relPath = relative(rootPath, full);
			const info = await stat(full);
			const { width, height } = await readDimensions({ path: full });

			found.push({
				kind: classifyAsset({ relPath }),
				name: entry.name,
				relPath,
				mime: mimeFor({ relPath }),
				size: info.size,
				width,
				height,
			});
		}
	}

	await walk({ dir: assetsRoot, depth: 0 });

	// Logos and emblems first — that is what a brand picker should show.
	const order: BrandAssetKind[] = [
		"logo",
		"emblem",
		"title-card",
		"image",
		"video",
		"font",
		"other",
	];
	return found.sort((a, b) => {
		const byKind = order.indexOf(a.kind) - order.indexOf(b.kind);
		return byKind !== 0 ? byKind : a.relPath.localeCompare(b.relPath);
	});
}

export async function readStyleGuide({
	rootPath,
	styleGuidePath,
}: {
	rootPath: string;
	styleGuidePath: string;
}): Promise<string | null> {
	const path = resolveWithinRoot({ rootPath, relPath: styleGuidePath });
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

export async function writeStyleGuide({
	rootPath,
	styleGuidePath,
	content,
}: {
	rootPath: string;
	styleGuidePath: string;
	content: string;
}): Promise<void> {
	const path = resolveWithinRoot({ rootPath, relPath: styleGuidePath });
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(path, content, "utf8");
}

/**
 * Colours and fonts from the style guide's YAML front matter.
 *
 * A deliberately small parser rather than a YAML dependency: the shape worth
 * reading is two flat maps, and anything more elaborate belongs in the prose
 * where a human will read it anyway.
 *
 * ```yaml
 * ---
 * colors:
 *   gold: "#F5C842"
 *   ink: "#1B1526"
 * fonts:
 *   display: Newsreader
 * ---
 * ```
 */
export function parseTokens({
	markdown,
}: {
	markdown: string | null;
}): BrandTokens | null {
	if (!markdown) return null;
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;

	const tokens: BrandTokens = {};
	let section: "colors" | "fonts" | null = null;

	for (const rawLine of match[1].split(/\r?\n/)) {
		if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;

		const top = rawLine.match(/^(colors|colours|fonts|typefaces)\s*:\s*$/i);
		if (top) {
			section = /font|typeface/i.test(top[1]) ? "fonts" : "colors";
			tokens[section] ??= {};
			continue;
		}
		if (!/^\s/.test(rawLine)) {
			section = null;
			continue;
		}
		if (!section) continue;

		const pair = rawLine.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/);
		if (!pair) continue;
		const value = pair[2].replace(/^["']|["']$/g, "");
		(tokens[section] as Record<string, string>)[pair[1]] = value;
	}

	return Object.keys(tokens).length > 0 ? tokens : null;
}

const STARTER_STYLE_GUIDE = ({ name }: { name: string }) => `---
colors:
  primary: "#F5C842"
  ink: "#1B1526"
fonts:
  display: Newsreader
---

# ${name} — style guide

## Voice
Describe how this brand sounds. Direct? Playful? What it never does.

## Colour
| Token | Hex | Used for |
|---|---|---|
| primary | #F5C842 | Accents, emphasis |
| ink | #1B1526 | Text, backgrounds |

## Type
Which typefaces, at which weights, for which roles.

## Assets
Drop logos, emblems and title cards into \`assets/\`. Names carry meaning —
a file with \`logo\`, \`emblem\` or \`title-card\` in it is filed as that kind.
`;

/**
 * Create the folder for a new brand: the root, an `assets/` directory, and a
 * style guide with something in it worth editing. Existing files are never
 * overwritten — creating a brand over a folder that already has a style guide
 * should adopt it, not clobber it.
 */
export async function scaffoldBrandFolder({
	rootPath,
	name,
	assetsDir,
	styleGuidePath,
	styleGuide,
}: {
	rootPath: string;
	name: string;
	assetsDir: string;
	styleGuidePath: string;
	styleGuide?: string;
}): Promise<void> {
	await mkdir(rootPath, { recursive: true });
	await mkdir(resolveWithinRoot({ rootPath, relPath: assetsDir }), {
		recursive: true,
	});

	const guidePath = resolveWithinRoot({ rootPath, relPath: styleGuidePath });
	if (!existsSync(guidePath)) {
		await writeFile(
			guidePath,
			styleGuide?.trim()
				? `${styleGuide.trim()}\n`
				: STARTER_STYLE_GUIDE({ name }),
			"utf8",
		);
	}
}

/**
 * Guess the style guide inside an existing folder being imported. People call
 * it different things, and asking is worse than looking.
 */
export async function findStyleGuide({
	rootPath,
}: {
	rootPath: string;
}): Promise<string | null> {
	const candidates = [
		"style-guide.md",
		"styleguide.md",
		"STYLE_GUIDE.md",
		"style_guide.md",
		"brand.md",
		"brand-guidelines.md",
		"README.md",
	];
	for (const candidate of candidates) {
		if (existsSync(join(rootPath, candidate))) return candidate;
	}

	// Fall back to any markdown at the top level.
	try {
		const entries = await readdir(rootPath, { withFileTypes: true });
		const markdown = entries.find(
			(entry) =>
				entry.isFile() &&
				entry.name.toLowerCase().endsWith(".md") &&
				!entry.name.startsWith("."),
		);
		if (markdown) return markdown.name;
	} catch {
		// Unreadable folder is the caller's problem to report.
	}
	return null;
}

/** The assets directory inside an existing folder, if it uses a common name. */
export async function findAssetsDir({
	rootPath,
}: {
	rootPath: string;
}): Promise<string> {
	for (const candidate of ["assets", "brand", "images", "logos", "media"]) {
		if (existsSync(join(rootPath, candidate))) return candidate;
	}
	// No conventional folder: index the root itself rather than finding nothing.
	return ".";
}

export function folderName({ rootPath }: { rootPath: string }): string {
	return basename(resolve(rootPath)) || "Brand";
}
