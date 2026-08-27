import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { getBrandAsset } from "@/brands/server/queries";
import { brandError, notFound } from "@/brands/server/respond";

export const dynamic = "force-dynamic";

/**
 * Serve a brand asset's bytes.
 *
 * The file lives in the user's own folder rather than the app's data directory,
 * so this is the only way the browser can see it. `getBrandAsset` resolves the
 * path through the brand root, which is what keeps a crafted asset id from
 * turning this into a reader for the rest of the disk.
 *
 * Streamed and range-aware because a brand may hold a title-card video, not
 * only logos.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string; assetId: string }> },
) {
	try {
		const { id, assetId } = await params;
		const found = await getBrandAsset({ brandId: id, assetId });
		if (!found) return notFound("Asset");

		let size: number;
		try {
			size = (await stat(found.absolutePath)).size;
		} catch {
			// Indexed but since deleted or moved. A rescan will drop it.
			return notFound("Asset file");
		}

		const contentType = found.asset.mime ?? "application/octet-stream";
		const range = request.headers.get("range");
		const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

		if (match) {
			const start = match[1] ? Number(match[1]) : 0;
			const end = match[2] ? Number(match[2]) : size - 1;
			if (
				Number.isNaN(start) ||
				Number.isNaN(end) ||
				start > end ||
				start >= size
			) {
				return new Response(null, {
					status: 416,
					headers: { "Content-Range": `bytes */${size}` },
				});
			}

			const capped = Math.min(end, size - 1);
			const stream = Readable.toWeb(
				createReadStream(found.absolutePath, { start, end: capped }),
			) as WebReadableStream<Uint8Array>;

			return new Response(stream as unknown as ReadableStream, {
				status: 206,
				headers: {
					"Content-Range": `bytes ${start}-${capped}/${size}`,
					"Accept-Ranges": "bytes",
					"Content-Length": String(capped - start + 1),
					"Content-Type": contentType,
				},
			});
		}

		const stream = Readable.toWeb(
			createReadStream(found.absolutePath),
		) as WebReadableStream<Uint8Array>;

		return new Response(stream as unknown as ReadableStream, {
			status: 200,
			headers: {
				"Accept-Ranges": "bytes",
				"Content-Length": String(size),
				"Content-Type": contentType,
				// The folder is edited outside the app, so a long cache would show
				// yesterday's logo. Revalidating keeps it honest and stays cheap.
				"Cache-Control": "no-cache",
			},
		});
	} catch (error) {
		return brandError(error);
	}
}
