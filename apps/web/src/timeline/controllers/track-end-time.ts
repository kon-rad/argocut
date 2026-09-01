import type { TimelineTrack } from "@/timeline";
import { addMediaTime, ZERO_MEDIA_TIME, type MediaTime } from "@/wasm";

/**
 * Latest point any element on this track reaches. Used to append the next
 * clip in a multi-file drop right after the previous one, instead of
 * re-targeting the original (now stale) drop point for every file.
 */
export function getTrackEndTime({ track }: { track: TimelineTrack }): MediaTime {
	let maxEnd: MediaTime = ZERO_MEDIA_TIME;
	for (const element of track.elements) {
		const end = addMediaTime({ a: element.startTime, b: element.duration });
		if (end > maxEnd) maxEnd = end;
	}
	return maxEnd;
}
