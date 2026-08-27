import type { ElementTarget } from "@argocut/agent-protocol";
import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline/types";

export interface ResolvedElement {
	trackId: string;
	elementId: string;
	track: TimelineTrack;
	element: TimelineElement;
}

export function listTracks({ tracks }: { tracks: SceneTracks }): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

export function trackRefOf({
	tracks,
	trackId,
}: {
	tracks: SceneTracks;
	trackId: string;
}): string {
	if (tracks.main.id === trackId) {
		return "main";
	}

	const overlayIndex = tracks.overlay.findIndex((track) => track.id === trackId);
	if (overlayIndex >= 0) {
		return `overlay:${overlayIndex}`;
	}

	const audioIndex = tracks.audio.findIndex((track) => track.id === trackId);
	if (audioIndex >= 0) {
		return `audio:${audioIndex}`;
	}

	return trackId;
}

export function resolveTrackRef({
	tracks,
	ref,
}: {
	tracks: SceneTracks;
	ref: string;
}): TimelineTrack {
	if (ref === "main") {
		return tracks.main;
	}

	const indexed = /^(overlay|audio):(\d+)$/.exec(ref);
	if (indexed) {
		const group = indexed[1] === "overlay" ? tracks.overlay : tracks.audio;
		const track = group[Number(indexed[2])];
		if (!track) {
			throw new Error(`Track ${ref} not found`);
		}
		return track;
	}

	const byId = listTracks({ tracks }).find((track) => track.id === ref);
	if (!byId) {
		throw new Error(`Track ${ref} not found`);
	}

	return byId;
}

function toResolved({
	track,
	element,
}: {
	track: TimelineTrack;
	element: TimelineElement;
}): ResolvedElement {
	return {
		trackId: track.id,
		elementId: element.id,
		track,
		element,
	};
}

export function resolveTarget({
	tracks,
	target,
	refs,
}: {
	tracks: SceneTracks;
	target: ElementTarget;
	refs?: Map<number, { trackId: string; elementId: string }>;
}): ResolvedElement {
	if ("ref" in target) {
		const recorded = refs?.get(target.ref);
		if (!recorded) {
			throw new Error(`No element was created by op ${target.ref}`);
		}
		return resolveTarget({ tracks, target: { elementId: recorded.elementId } });
	}

	if ("elementId" in target) {
		for (const track of listTracks({ tracks })) {
			const element = track.elements.find((item) => item.id === target.elementId);
			if (element) {
				return toResolved({ track, element });
			}
		}
		throw new Error(`Element ${target.elementId} not found`);
	}

	if ("name" in target) {
		const matches: ResolvedElement[] = [];
		for (const track of listTracks({ tracks })) {
			for (const element of track.elements) {
				if (element.name === target.name) {
					matches.push(toResolved({ track, element }));
				}
			}
		}
		if (matches.length === 0) {
			throw new Error(`Element named "${target.name}" not found`);
		}
		if (matches.length > 1) {
			throw new Error(
				`Element name "${target.name}" is ambiguous — ${matches.length} elements match. Address it by elementId instead.`,
			);
		}
		return matches[0];
	}

	const track = resolveTrackRef({ tracks, ref: target.track });
	const element = track.elements[target.index];
	if (!element) {
		throw new Error(`Track ${target.track} has no element at index ${target.index}`);
	}

	return toResolved({ track, element });
}
