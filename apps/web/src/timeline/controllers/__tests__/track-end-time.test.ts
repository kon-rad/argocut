import { describe, expect, test } from "bun:test";
import type { VideoElement, VideoTrack } from "@/timeline";
import { getTrackEndTime } from "@/timeline/controllers/track-end-time";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";

function buildVideoElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		startTime: mediaTime({ ticks: startTime }),
		duration: mediaTime({ ticks: duration }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		mediaId: `media-${id}`,
		params: {
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
		},
	};
}

function buildVideoTrack({
	id,
	elements,
}: {
	id: string;
	elements: VideoElement[];
}): VideoTrack {
	return { id, type: "video", name: id, elements, muted: false, hidden: false };
}

describe("getTrackEndTime", () => {
	test("returns zero for an empty track", () => {
		const track = buildVideoTrack({ id: "main", elements: [] });
		expect(getTrackEndTime({ track })).toBe(ZERO_MEDIA_TIME);
	});

	test("returns the end of the single element", () => {
		const track = buildVideoTrack({
			id: "main",
			elements: [buildVideoElement({ id: "a", startTime: 0, duration: 100 })],
		});
		expect(getTrackEndTime({ track })).toBe(mediaTime({ ticks: 100 }));
	});

	test("returns the furthest end across elements regardless of order", () => {
		const track = buildVideoTrack({
			id: "main",
			elements: [
				buildVideoElement({ id: "a", startTime: 200, duration: 50 }),
				buildVideoElement({ id: "b", startTime: 0, duration: 100 }),
			],
		});
		// a ends at 250, b ends at 100 — furthest end wins even though a
		// isn't the element with the latest startTime alone.
		expect(getTrackEndTime({ track })).toBe(mediaTime({ ticks: 250 }));
	});
});
