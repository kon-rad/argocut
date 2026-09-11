import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import {
	getBlobPath,
	getBlobType,
	removeBlob,
	setBlob,
} from "@/services/storage/server/file-store";

/**
 * Media files run to hundreds of megabytes, so the body is streamed rather than
 * buffered, and range requests are honoured — without them the player pulls a
 * whole clip to seek one second into it.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ bucket: string; key: string }> },
) {
	const { bucket, key } = await params;
	try {
		const found = await getBlobPath({ bucket, key: decodeURIComponent(key) });
		if (!found) {
			return new Response(null, { status: 404 });
		}

		const contentType =
			(await getBlobType({ bucket, key: decodeURIComponent(key) })) ??
			"application/octet-stream";
		const range = request.headers.get("range");
		const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

		if (match) {
			const start = match[1] ? Number(match[1]) : 0;
			const end = match[2] ? Number(match[2]) : found.size - 1;
			if (
				Number.isNaN(start) ||
				Number.isNaN(end) ||
				start > end ||
				start >= found.size
			) {
				return new Response(null, {
					status: 416,
					headers: { "Content-Range": `bytes */${found.size}` },
				});
			}

			const capped = Math.min(end, found.size - 1);
			const stream = Readable.toWeb(
				createReadStream(found.path, { start, end: capped }),
			) as WebReadableStream<Uint8Array>;

			return new Response(stream as unknown as ReadableStream, {
				status: 206,
				headers: {
					"Content-Range": `bytes ${start}-${capped}/${found.size}`,
					"Accept-Ranges": "bytes",
					"Content-Length": String(capped - start + 1),
					"Content-Type": contentType,
				},
			});
		}

		const stream = Readable.toWeb(
			createReadStream(found.path),
		) as WebReadableStream<Uint8Array>;

		return new Response(stream as unknown as ReadableStream, {
			status: 200,
			headers: {
				"Accept-Ranges": "bytes",
				"Content-Length": String(found.size),
				"Content-Type": contentType,
			},
		});
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ bucket: string; key: string }> },
) {
	const { bucket, key } = await params;
	try {
		await setBlob({
			bucket,
			key: decodeURIComponent(key),
			data: request.body,
			contentType: request.headers.get("content-type") ?? undefined,
		});
		return new Response(null, { status: 204 });
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ bucket: string; key: string }> },
) {
	const { bucket, key } = await params;
	try {
		await removeBlob({ bucket, key: decodeURIComponent(key) });
		return new Response(null, { status: 204 });
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 400 });
	}
}
