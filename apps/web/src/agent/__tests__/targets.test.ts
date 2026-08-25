import { describe, expect, test } from "bun:test";
import type { SceneTracks } from "@/timeline/types";
import { mediaTime } from "@/wasm";
import { listTracks, resolveTarget, resolveTrackRef, trackRefOf } from "../targets";

const zero = mediaTime({ ticks: 0 });

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
					duration: zero,
					startTime: zero,
					trimStart: zero,
					trimEnd: zero,
					params: {},
				},
				{
					id: "el-b",
					name: "outro",
					type: "video",
					mediaId: "m2",
					duration: zero,
					startTime: zero,
					trimStart: zero,
					trimEnd: zero,
					params: {},
				},
			],
		},
		overlay: [],
		audio: [
			{
				id: "track-audio-0",
				name: "Audio 1",
				type: "audio",
				muted: false,
				elements: [],
			},
		],
	};
}

describe("resolveTrackRef", () => {
	test("resolves main", () => {
		expect(resolveTrackRef({ tracks: buildTracks(), ref: "main" }).id).toBe("track-main");
	});

	test("resolves an indexed audio ref", () => {
		expect(resolveTrackRef({ tracks: buildTracks(), ref: "audio:0" }).id).toBe("track-audio-0");
	});

	test("resolves a raw track id", () => {
		expect(resolveTrackRef({ tracks: buildTracks(), ref: "track-audio-0" }).type).toBe("audio");
	});

	test("throws on an unknown ref", () => {
		expect(() => resolveTrackRef({ tracks: buildTracks(), ref: "audio:7" })).toThrow();
	});
});

describe("resolveTarget", () => {
	test("resolves by element id", () => {
		const resolved = resolveTarget({ tracks: buildTracks(), target: { elementId: "el-b" } });
		expect(resolved.trackId).toBe("track-main");
		expect(resolved.element.name).toBe("outro");
	});

	test("resolves by name", () => {
		const resolved = resolveTarget({ tracks: buildTracks(), target: { name: "intro" } });
		expect(resolved.elementId).toBe("el-a");
	});

	test("throws when a name is ambiguous", () => {
		const tracks = buildTracks();
		tracks.main.elements[1].name = "intro";
		expect(() => resolveTarget({ tracks, target: { name: "intro" } })).toThrow(/ambiguous/i);
	});

	test("resolves by track and index", () => {
		const resolved = resolveTarget({ tracks: buildTracks(), target: { track: "main", index: 1 } });
		expect(resolved.elementId).toBe("el-b");
	});

	test("resolves a back-reference through the refs map", () => {
		const refs = new Map([[0, { trackId: "track-main", elementId: "el-a" }]]);
		const resolved = resolveTarget({ tracks: buildTracks(), target: { ref: 0 }, refs });
		expect(resolved.elementId).toBe("el-a");
	});

	test("throws on an unknown element id", () => {
		expect(() => resolveTarget({ tracks: buildTracks(), target: { elementId: "nope" } })).toThrow(/not found/i);
	});

	test("reports the ref of the track an element sits on", () => {
		expect(trackRefOf({ tracks: buildTracks(), trackId: "track-audio-0" })).toBe("audio:0");
	});

	test("lists main, overlay and audio tracks", () => {
		expect(listTracks({ tracks: buildTracks() }).map((track) => track.id)).toEqual([
			"track-main",
			"track-audio-0",
		]);
	});
});
