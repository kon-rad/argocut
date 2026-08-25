import { describe, expect, test } from "bun:test";
import type { SceneTracks } from "@/timeline/types";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";
import { serializeTracks } from "../serialize";

function buildTracks(): SceneTracks {
	return {
		main: {
			id: "track-main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "el-a",
					name: "intro",
					type: "video",
					mediaId: "m1",
					startTime: mediaTime({ ticks: TICKS_PER_SECOND }),
					duration: mediaTime({ ticks: 4 * TICKS_PER_SECOND }),
					trimStart: mediaTime({ ticks: 0 }),
					trimEnd: mediaTime({ ticks: 0 }),
					retime: { rate: 2 },
					params: { opacity: 100 },
				},
			],
		},
		overlay: [],
		audio: [],
	};
}

describe("serializeTracks", () => {
	test("reports times in seconds", () => {
		const [track] = serializeTracks({ tracks: buildTracks(), format: "full" });
		expect(track.elements[0].startTime).toBeCloseTo(1, 6);
		expect(track.elements[0].duration).toBeCloseTo(4, 6);
		expect(track.elements[0].endTime).toBeCloseTo(5, 6);
	});

	test("carries the retime rate", () => {
		const [track] = serializeTracks({ tracks: buildTracks(), format: "full" });
		expect(track.elements[0].rate).toBe(2);
	});

	test("omits params in compact format", () => {
		const [track] = serializeTracks({ tracks: buildTracks(), format: "compact" });
		expect(track.elements[0].params).toBeUndefined();
	});

	test("includes params in full format", () => {
		const [track] = serializeTracks({ tracks: buildTracks(), format: "full" });
		expect(track.elements[0].params).toEqual({ opacity: 100 });
	});

	test("labels the main track ref", () => {
		const [track] = serializeTracks({ tracks: buildTracks(), format: "compact" });
		expect(track.ref).toBe("main");
	});
});
