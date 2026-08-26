import type {
	ElementDTO,
	MediaAssetDTO,
	ParamDefinitionDTO,
	ProjectDTO,
	ProjectSummaryDTO,
	TimelineDTO,
} from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { getElementParams } from "@/params/registry";
import { readStorageQuotaStatus } from "@/services/storage/quota";
import { storageService } from "@/services/storage/service";
import { listTracks, resolveTarget } from "./targets";
import {
	serializeElement,
	serializeTimeline,
	type SerializeFormat,
} from "./serialize";
import { toSeconds } from "./time";

export async function listProjects(): Promise<ProjectSummaryDTO[]> {
	const metadata = await storageService.loadAllProjectsMetadata();
	return metadata.map((item) => ({
		id: item.id,
		name: item.name,
		durationSeconds: toSeconds({ time: item.duration }),
		updatedAt: new Date(item.updatedAt).toISOString(),
	}));
}

export async function readProject(): Promise<ProjectDTO> {
	const editor = EditorCore.getInstance();
	const project = editor.project.getActive();
	const quota = await readStorageQuotaStatus();
	const persisted = (await navigator.storage?.persisted?.()) ?? false;

	const media: MediaAssetDTO[] = editor.media.getAssets().map((asset) => ({
		id: asset.id,
		name: asset.name,
		type: asset.type,
		durationSeconds: asset.duration,
		width: asset.width,
		height: asset.height,
		fps: asset.fps,
		hasAudio: asset.hasAudio,
	}));

	return {
		id: project.metadata.id,
		name: project.metadata.name,
		durationSeconds: toSeconds({ time: editor.timeline.getTotalDuration() }),
		fps: project.settings.fps.numerator / project.settings.fps.denominator,
		frameRate: {
			numerator: project.settings.fps.numerator,
			denominator: project.settings.fps.denominator,
		},
		canvasSize: project.settings.canvasSize,
		background: project.settings.background,
		scenes: project.scenes.map((scene) => ({
			id: scene.id,
			name: scene.name,
			isMain: scene.isMain,
		})),
		currentSceneId: project.currentSceneId,
		media,
		storage: {
			usedBytes: quota.usageBytes,
			availableBytes: quota.availableBytes,
			persisted,
		},
	};
}

export function readTimeline({
	format,
}: {
	format: SerializeFormat;
}): TimelineDTO {
	const editor = EditorCore.getInstance();
	const scene = editor.scenes.getActiveScene();

	return serializeTimeline({
		scene,
		durationSeconds: toSeconds({ time: editor.timeline.getTotalDuration() }),
		format,
	});
}

export function findElements({
	type,
	nameContains,
	atTime,
	track,
}: {
	type?: string;
	nameContains?: string;
	atTime?: number;
	track?: string;
}): ElementDTO[] {
	const editor = EditorCore.getInstance();
	const tracks = editor.scenes.getActiveScene().tracks;
	const results: ElementDTO[] = [];

	for (const timelineTrack of listTracks({ tracks })) {
		for (const element of timelineTrack.elements) {
			if (type && element.type !== type) continue;
			if (
				nameContains &&
				!element.name.toLowerCase().includes(nameContains.toLowerCase())
			) {
				continue;
			}

			const dto = serializeElement({
				element,
				track: timelineTrack,
				tracks,
				format: "compact",
			});

			if (track && dto.trackRef !== track && dto.trackId !== track) continue;
			if (atTime !== undefined && (atTime < dto.startTime || atTime >= dto.endTime)) {
				continue;
			}

			results.push(dto);
		}
	}

	return results;
}

export function describeParams({
	elementId,
}: {
	elementId: string;
}): ParamDefinitionDTO[] {
	const editor = EditorCore.getInstance();
	const tracks = editor.scenes.getActiveScene().tracks;
	const { element } = resolveTarget({ tracks, target: { elementId } });

	return getElementParams({ element }).map((param) => {
		const dto: ParamDefinitionDTO = {
			key: param.key,
			label: param.label,
			type: param.type,
			default: param.default,
			keyframable: param.keyframable !== false,
		};

		if (param.type === "number") {
			dto.min = param.min;
			dto.max = param.max;
			dto.step = param.step;
		}
		if (param.type === "select") {
			dto.options = param.options;
		}

		return dto;
	});
}
