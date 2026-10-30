import type { EditorCore } from "@/core";
import { processMediaAssets } from "@/media/processing";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import type { YoutubeDownloadFormat, YoutubeSearchResult } from "@/youtube/types";

const EXTENSION_BY_FORMAT: Record<YoutubeDownloadFormat, string> = {
	video: "mp4",
	audio: "mp3",
};

const MIME_TYPE_BY_FORMAT: Record<YoutubeDownloadFormat, string> = {
	video: "video/mp4",
	audio: "audio/mpeg",
};

function sanitizeFilename({ name }: { name: string }): string {
	const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 150);
	return cleaned || "youtube-video";
}

export async function downloadYoutubeResultToProject({
	editor,
	projectId,
	result,
	format,
}: {
	editor: EditorCore;
	projectId: string;
	result: YoutubeSearchResult;
	format: YoutubeDownloadFormat;
}): Promise<void> {
	const params = new URLSearchParams({ id: result.id, format });
	const response = await fetch(`/api/youtube/download?${params.toString()}`);

	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(
			(body && typeof body.error === "string" && body.error) ||
				`Download failed (${response.status})`,
		);
	}

	const blob = await response.blob();
	const filename = `${sanitizeFilename({ name: result.title })}.${EXTENSION_BY_FORMAT[format]}`;
	const file = new File([blob], filename, { type: MIME_TYPE_BY_FORMAT[format] });

	const [processedAsset] = await processMediaAssets({ files: [file] });
	if (!processedAsset) {
		throw new Error("Could not process the downloaded file");
	}

	const asset = await editor.media.addMediaAsset({
		projectId,
		asset: processedAsset,
	});
	if (!asset) {
		throw new Error("Could not save the downloaded media");
	}

	const duration =
		asset.duration != null
			? mediaTimeFromSeconds({ seconds: asset.duration })
			: DEFAULT_NEW_ELEMENT_DURATION;

	const element = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: asset.type,
		name: asset.name,
		duration,
		startTime: editor.playback.getCurrentTime(),
	});

	editor.timeline.insertElement({
		element,
		placement: { mode: "auto" },
	});
}
