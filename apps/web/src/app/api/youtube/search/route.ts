import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runYtDlpCapture } from "@/youtube/yt-dlp";
import type { YoutubeSearchResult } from "@/youtube/types";

export const runtime = "nodejs";

const searchParamsSchema = z.object({
	q: z.string().trim().min(1, "Search query is required").max(200, "Query too long"),
});

const RESULT_COUNT = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function pickThumbnailUrl({ entry }: { entry: Record<string, unknown> }): string {
	if (typeof entry.thumbnail === "string") return entry.thumbnail;

	const thumbnails = entry.thumbnails;
	if (Array.isArray(thumbnails) && thumbnails.length > 0) {
		const last = thumbnails[thumbnails.length - 1];
		if (last && typeof last === "object" && typeof last.url === "string") {
			return last.url;
		}
	}

	return "";
}

function parseSearchResults({ raw }: { raw: string }): YoutubeSearchResult[] {
	const results: YoutubeSearchResult[] = [];

	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (!isRecord(parsed)) continue;

			const entry = parsed;
			if (typeof entry.id !== "string" || typeof entry.title !== "string") {
				continue;
			}

			results.push({
				id: entry.id,
				title: entry.title,
				channel:
					typeof entry.channel === "string"
						? entry.channel
						: typeof entry.uploader === "string"
							? entry.uploader
							: "",
				duration: typeof entry.duration === "number" ? entry.duration : 0,
				thumbnailUrl: pickThumbnailUrl({ entry }),
			});
		} catch {
			// Skip malformed lines rather than failing the whole search.
		}
	}

	return results;
}

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);

	const validationResult = searchParamsSchema.safeParse({
		q: searchParams.get("q") ?? undefined,
	});

	if (!validationResult.success) {
		return NextResponse.json(
			{
				error: "Invalid parameters",
				details: validationResult.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	const { q: query } = validationResult.data;

	try {
		const raw = await runYtDlpCapture({
			args: [
				`ytsearch${RESULT_COUNT}:${query}`,
				"--dump-json",
				"--skip-download",
				"--no-warnings",
				"--no-playlist",
				"--flat-playlist",
			],
		});

		const results = parseSearchResults({ raw });

		return NextResponse.json({ results });
	} catch (error) {
		console.error("YouTube search failed:", error);
		return NextResponse.json({ error: "Failed to search YouTube" }, { status: 502 });
	}
}
