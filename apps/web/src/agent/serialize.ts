import type { ElementDTO, TrackDTO } from "@argocut/agent-protocol";
import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	TScene,
} from "@/timeline/types";
import { listTracks, trackRefOf } from "./targets";
import { toSeconds } from "./time";

export type SerializeFormat = "compact" | "full";

export function serializeElement({
	element,
	track,
	tracks,
	format,
}: {
	element: TimelineElement;
	track: TimelineTrack;
	tracks: SceneTracks;
	format: SerializeFormat;
}): ElementDTO {
	const startTime = toSeconds({ time: element.startTime });
	const duration = toSeconds({ time: element.duration });

	const dto: ElementDTO = {
		id: element.id,
		name: element.name,
		type: element.type,
		trackId: track.id,
		trackRef: trackRefOf({ tracks, trackId: track.id }),
		startTime,
		endTime: startTime + duration,
		duration,
		trimStart: toSeconds({ time: element.trimStart }),
		trimEnd: toSeconds({ time: element.trimEnd }),
	};

	if (element.sourceDuration !== undefined) {
		dto.sourceDuration = toSeconds({ time: element.sourceDuration });
	}
	if ("mediaId" in element && typeof element.mediaId === "string") {
		dto.mediaId = element.mediaId;
	}
	if ("retime" in element && element.retime) {
		dto.rate = element.retime.rate;
	}
	if ("hidden" in element && element.hidden !== undefined) {
		dto.hidden = element.hidden;
	}

	if (format === "full") {
		dto.params = { ...element.params };
		if (element.animations) {
			dto.animatedParams = Object.keys(element.animations);
		}
		if ("effects" in element && element.effects?.length) {
			dto.effectTypes = element.effects.map((effect) => effect.type);
		}
		if ("masks" in element && element.masks?.length) {
			dto.maskTypes = element.masks.map((mask) => mask.type);
		}
	}

	return dto;
}

export function serializeTracks({
	tracks,
	format,
}: {
	tracks: SceneTracks;
	format: SerializeFormat;
}): TrackDTO[] {
	return listTracks({ tracks }).map((track) => {
		const dto: TrackDTO = {
			id: track.id,
			ref: trackRefOf({ tracks, trackId: track.id }),
			name: track.name,
			type: track.type,
			elements: track.elements.map((element) =>
				serializeElement({ element, track, tracks, format }),
			),
		};

		if ("muted" in track) {
			dto.muted = track.muted;
		}
		if ("hidden" in track) {
			dto.hidden = track.hidden;
		}

		return dto;
	});
}

export function serializeTimeline({
	scene,
	durationSeconds,
	format,
}: {
	scene: TScene;
	durationSeconds: number;
	format: SerializeFormat;
}) {
	return {
		sceneId: scene.id,
		sceneName: scene.name,
		durationSeconds,
		tracks: serializeTracks({ tracks: scene.tracks, format }),
	};
}
