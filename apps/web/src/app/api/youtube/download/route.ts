import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runYtDlp } from "@/youtube/yt-dlp";

export const runtime = "nodejs";

const searchParamsSchema = z.object({
	id: z.string().regex(/^[\w-]{11}$/, "Invalid video id"),
	format: z.enum(["video", "audio"]),
});

const MIME_TYPES = {
	video: "video/mp4",
	audio: "audio/mpeg",
} as const;

function buildArgs({
	format,
	url,
	outputTemplate,
}: {
	format: "video" | "audio";
	url: string;
	outputTemplate: string;
}): string[] {
	const common = ["-o", outputTemplate, "--no-warnings", "--no-playlist", url];

	if (format === "audio") {
		return ["-x", "--audio-format", "mp3", ...common];
	}

	return [
		"-f",
		"bv*[height<=1080]+ba/b[height<=1080]",
		"--merge-output-format",
		"mp4",
		...common,
	];
}

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);

	const validationResult = searchParamsSchema.safeParse({
		id: searchParams.get("id") ?? undefined,
		format: searchParams.get("format") ?? undefined,
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

	const { id, format } = validationResult.data;
	const url = `https://www.youtube.com/watch?v=${id}`;

	const tmpDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "argocut-youtube-"),
	);
	const outputTemplate = path.join(tmpDir, "download.%(ext)s");

	try {
		await runYtDlp({ args: buildArgs({ format, url, outputTemplate }) });

		const files = await fs.promises.readdir(tmpDir);
		const outputFile = files[0];
		if (!outputFile) {
			throw new Error("yt-dlp did not produce an output file");
		}

		const filePath = path.join(tmpDir, outputFile);
		const buffer = await fs.promises.readFile(filePath);
		await fs.promises.rm(tmpDir, { recursive: true, force: true });

		return new Response(buffer, {
			headers: {
				"Content-Type": MIME_TYPES[format],
				"Content-Length": String(buffer.byteLength),
			},
		});
	} catch (error) {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
		console.error("YouTube download failed:", error);
		return NextResponse.json(
			{ error: "Failed to download from YouTube" },
			{ status: 502 },
		);
	}
}
