import { beforeEach, describe, expect, mock, test } from "bun:test";

// `executeFileDrop` calls these two modules for real media decoding and a
// sonner toast — neither works (or is meaningful) under `bun test`. Replace
// them with lightweight stand-ins before importing the controller.
mock.module("@/media/upload-toast", () => ({
	showMediaUploadToast: async ({
		promise,
	}: {
		promise: () => Promise<unknown>;
	}) => promise(),
}));

// Maps a fake File to the duration (seconds) it should report, without
// bolting an untyped property onto the File instance.
const testFileDurations = new Map<File, number>();

mock.module("@/media/processing", () => ({
	processMediaAssets: async ({ files }: { files: File[] }) =>
		files.map((file) => ({
			file,
			name: file.name,
			type: "video" as const,
			duration: testFileDurations.get(file) ?? 0,
		})),
}));

const { DragDropController } = await import("../drag-drop-controller");
const { TimelineDragSource } = await import("@/timeline/drag-source");
const { ZERO_MEDIA_TIME } = await import("@/wasm");
const { toElementDurationTicks } = await import("@/timeline/creation");

import type { DragDropConfig } from "../drag-drop-controller";
import type { SceneTracks, VideoTrack } from "@/timeline";
import type { MediaAsset } from "@/media/types";

// `createdAsset.duration` (and therefore this mock's duration) is in
// seconds — `executeFileDrop` converts it to ticks itself via
// `toElementDurationTicks`.
function fakeFile({
	name,
	durationSeconds,
}: {
	name: string;
	durationSeconds: number;
}): File {
	const file = new File(["fake"], name, { type: "video/mp4" });
	testFileDurations.set(file, durationSeconds);
	return file;
}

function buildEmptyMainTrack(): VideoTrack {
	return { id: "main-track", type: "video", name: "Main", elements: [], muted: false, hidden: false };
}

// Only `getBoundingClientRect` (plus scroll offsets) is read by the
// controller's coordinate math — these stand-ins deliberately don't
// implement the rest of HTMLDivElement.
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal DOM test double, see comment above
const fakeContainerEl = {
	getBoundingClientRect: () => ({ left: 0, top: 0 }),
} as unknown as HTMLDivElement;

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal DOM test double, see comment above
const fakeTracksScrollEl = {
	getBoundingClientRect: () => ({ left: 0, top: 0 }),
	scrollLeft: 0,
	scrollTop: 0,
} as unknown as HTMLDivElement;

describe("DragDropController — multi-file external drop", () => {
	let sceneTracks: SceneTracks;
	let insertCalls: { trackId: string; startTime: number }[];
	let executeCommandCalls: number;
	let controller: InstanceType<typeof DragDropController>;

	beforeEach(() => {
		sceneTracks = { overlay: [], main: buildEmptyMainTrack(), audio: [] };
		insertCalls = [];
		executeCommandCalls = 0;

		let nextAssetId = 0;

		const config: DragDropConfig = {
			zoomLevel: 1,
			getContainerEl: () => fakeContainerEl,
			getHeaderEl: () => null,
			getTracksScrollEl: () => fakeTracksScrollEl,
			getActiveProjectFps: () => null,
			getActiveProjectId: () => "project-1",
			getSceneTracks: () => sceneTracks,
			getCurrentPlayheadTime: () => ZERO_MEDIA_TIME,
			getMediaAssets: () => [],
			dragSource: new TimelineDragSource(),
			addMediaAsset: async ({ asset }) => {
				nextAssetId += 1;
				return {
					id: `asset-${nextAssetId}`,
					name: asset.name,
					type: asset.type,
					duration: asset.duration,
					file: asset.file,
				} satisfies MediaAsset;
			},
			executeCommand: () => {
				executeCommandCalls += 1;
			},
			insertElement: ({ placement, element }) => {
				const track = [sceneTracks.main, ...sceneTracks.overlay, ...sceneTracks.audio].find(
					(t) => t.id === placement.trackId,
				);
				if (!track) throw new Error(`unknown track ${placement.trackId}`);
				insertCalls.push({
					trackId: placement.trackId,
					startTime: element.startTime,
				});
				(track.elements as unknown[]).push({
					...(element as object),
					id: `el-${insertCalls.length}`,
				});
			},
			addClipEffect: () => {},
		};

		controller = new DragDropController({ configRef: { current: config } });
	});

	function drop({ files }: { files: File[] }) {
		// Only the fields `onDrop` actually reads (files/types for the
		// early-exit check, clientX/Y for coordinate math) are provided.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal DragEvent test double
		const event = {
			preventDefault: () => {},
			dataTransfer: { files, types: ["Files"] },
			clientX: 50,
			clientY: 10,
		} as unknown as import("react").DragEvent;
		controller.onDrop(event);
	}

	test("two dropped video files both land on the same track, one after another", async () => {
		const files = [
			fakeFile({ name: "a.mp4", durationSeconds: 100 }),
			fakeFile({ name: "b.mp4", durationSeconds: 50 }),
		];

		drop({ files });
		// executeFileDrop awaits internally but onDrop fires it without awaiting;
		// flush microtasks so both sequential inserts land.
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(executeCommandCalls).toBe(0);
		expect(insertCalls).toHaveLength(2);
		expect(insertCalls[0].trackId).toBe("main-track");
		expect(insertCalls[1].trackId).toBe("main-track");
		expect(insertCalls[1].startTime).toBe(
			toElementDurationTicks({ seconds: 100 }),
		);
	});
});
