# Agent MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AI agent create and edit OpenCut projects unattended through an MCP server, and hand a finished-but-editable project to a human in a browser.

**Architecture:** A typed facade (`apps/web/src/agent/`) wraps `EditorCore` inside the web app and is exposed on `window.__opencutAgent`. An MCP server (`packages/mcp-server/`) drives a persistent headless Chromium profile with Playwright and calls that facade via `page.evaluate`. Op schemas and DTOs live in a shared workspace package (`packages/agent-protocol/`) so both sides agree by construction.

**Tech Stack:** Bun 1.2.18 workspaces, TypeScript, Next.js 16, zod 4.3.6, `@modelcontextprotocol/server` 2.0.0, Playwright 1.62.

**Spec:** `docs/agent-mcp-design.md`

## Global Constraints

- Package manager is **bun**. Never introduce npm or pnpm lockfiles.
- Formatting is **tabs**, double quotes, semicolons (see `.prettierrc.json` and existing source). Match surrounding files exactly.
- Functions in this codebase take a **single destructured object argument**, not positional parameters. Follow that everywhere: `foo({ bar })`, never `foo(bar)`. The only exceptions are existing APIs that already differ.
- Path alias inside `apps/web` is `@/*` → `apps/web/src/*`.
- `MediaTime` is a branded integer tick count. The **only** legal constructions are `mediaTimeFromSeconds({ seconds })` and `mediaTime({ ticks })` from `@/wasm`. Never cast a number to `MediaTime`.
- `TICKS_PER_SECOND` from `@/wasm` is the tick scale.
- The agent facade is gated on `process.env.NEXT_PUBLIC_OPENCUT_AGENT_API === "1"`. It must be impossible to reach in a normal production build.
- Facade methods **never throw across the `page.evaluate` boundary**. Every method returns `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`. Error classes do not survive structured cloning.
- Unit tests run with `bun test` from the repo root and import from `bun:test`.
- Shared package name is `@opencut/agent-protocol`; MCP package name is `@opencut/mcp-server`.
- Commit after every task.

---

### Task 1: Shared protocol package

Creates the single source of truth for op schemas and DTOs that both the web facade and the MCP server import.

**Files:**
- Create: `packages/agent-protocol/package.json`
- Create: `packages/agent-protocol/tsconfig.json`
- Create: `packages/agent-protocol/src/index.ts`
- Create: `packages/agent-protocol/src/dto.ts`
- Create: `packages/agent-protocol/src/ops.ts`
- Create: `packages/agent-protocol/src/result.ts`
- Test: `packages/agent-protocol/src/__tests__/ops.test.ts`
- Modify: `apps/web/next.config.ts` (add `transpilePackages`)
- Modify: `apps/web/package.json` (add the dependency)

**Interfaces:**
- Consumes: nothing.
- Produces: `EditOp` (zod-inferred union), `editOpSchema`, `elementTargetSchema`, `ElementTarget`, `TrackRef`, `ElementDTO`, `TrackDTO`, `TimelineDTO`, `ProjectDTO`, `MediaAssetDTO`, `ImportResultDTO`, `AgentResult<T>`, `AgentErrorPayload`, `AgentErrorCode`, `ok()`, `err()`.

- [ ] **Step 1: Create the package manifest**

`packages/agent-protocol/package.json`:

```json
{
	"name": "@opencut/agent-protocol",
	"version": "0.1.0",
	"private": true,
	"type": "module",
	"main": "./src/index.ts",
	"types": "./src/index.ts",
	"exports": {
		".": "./src/index.ts"
	},
	"dependencies": {
		"zod": "4.3.6"
	}
}
```

`packages/agent-protocol/tsconfig.json`:

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"lib": ["esnext"],
		"module": "esnext",
		"moduleResolution": "bundler",
		"strict": true,
		"noEmit": true,
		"isolatedModules": true,
		"skipLibCheck": true,
		"forceConsistentCasingInFileNames": true
	},
	"include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Write the result type**

`packages/agent-protocol/src/result.ts`:

```ts
export type AgentErrorCode =
	| "editor_not_ready"
	| "invalid_argument"
	| "not_found"
	| "op_refused"
	| "storage_quota"
	| "unsupported"
	| "internal";

export interface AgentErrorPayload {
	code: AgentErrorCode;
	message: string;
	details?: unknown;
}

export type AgentResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: AgentErrorPayload };

export function ok<T>({ value }: { value: T }): AgentResult<T> {
	return { ok: true, value };
}

export function err<T>({
	code,
	message,
	details,
}: {
	code: AgentErrorCode;
	message: string;
	details?: unknown;
}): AgentResult<T> {
	return { ok: false, error: { code, message, details } };
}
```

- [ ] **Step 3: Write the DTOs**

`packages/agent-protocol/src/dto.ts`:

```ts
export type TrackRef = string;

export interface ElementDTO {
	id: string;
	name: string;
	type: string;
	trackId: string;
	trackRef: TrackRef;
	startTime: number;
	endTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	sourceDuration?: number;
	mediaId?: string;
	rate?: number;
	hidden?: boolean;
	params?: Record<string, string | number | boolean>;
	animatedParams?: string[];
	effectTypes?: string[];
	maskTypes?: string[];
}

export interface TrackDTO {
	id: string;
	ref: TrackRef;
	name: string;
	type: string;
	muted?: boolean;
	hidden?: boolean;
	elements: ElementDTO[];
}

export interface TimelineDTO {
	sceneId: string;
	sceneName: string;
	durationSeconds: number;
	tracks: TrackDTO[];
}

export interface MediaAssetDTO {
	id: string;
	name: string;
	type: string;
	durationSeconds?: number;
	width?: number;
	height?: number;
	fps?: number;
	hasAudio?: boolean;
}

export interface ProjectDTO {
	id: string;
	name: string;
	durationSeconds: number;
	fps: number;
	canvasSize: { width: number; height: number };
	background: { type: string; color?: string; blurIntensity?: number };
	scenes: Array<{ id: string; name: string; isMain: boolean }>;
	currentSceneId: string;
	media: MediaAssetDTO[];
	storage: { usedBytes: number; availableBytes: number };
}

export interface ProjectSummaryDTO {
	id: string;
	name: string;
	durationSeconds: number;
	updatedAt: string;
}

export type ImportResultDTO =
	| { path: string; ok: true; mediaId: string; asset: MediaAssetDTO }
	| { path: string; ok: false; skipped: string };

export interface ParamDefinitionDTO {
	key: string;
	label: string;
	type: string;
	default: string | number | boolean;
	min?: number;
	max?: number;
	step?: number;
	keyframable: boolean;
	options?: Array<{ value: string | number; label: string }>;
}
```

- [ ] **Step 4: Write the op schemas**

`packages/agent-protocol/src/ops.ts`:

```ts
import { z } from "zod";

export const elementTargetSchema = z.union([
	z.object({ elementId: z.string().min(1) }),
	z.object({ name: z.string().min(1) }),
	z.object({ track: z.string().min(1), index: z.number().int().min(0) }),
	z.object({ ref: z.number().int().min(0) }),
]);

export type ElementTarget = z.infer<typeof elementTargetSchema>;

const seconds = z.number().finite().min(0);
const paramValue = z.union([z.string(), z.number(), z.boolean()]);

export const editOpSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("add_clip"),
		mediaId: z.string().min(1),
		track: z.string().min(1).default("main"),
		startTime: seconds.optional(),
		trimStart: seconds.optional(),
		trimEnd: seconds.optional(),
		name: z.string().optional(),
	}),
	z.object({
		op: z.literal("add_text"),
		text: z.string(),
		startTime: seconds,
		duration: z.number().finite().positive(),
		track: z.string().min(1).optional(),
		params: z.record(z.string(), paramValue).optional(),
	}),
	z.object({
		op: z.literal("split"),
		target: elementTargetSchema,
		atTime: seconds,
		retain: z.enum(["both", "left", "right"]).default("both"),
	}),
	z.object({
		op: z.literal("trim"),
		target: elementTargetSchema,
		trimStart: seconds.optional(),
		trimEnd: seconds.optional(),
	}),
	z.object({
		op: z.literal("retime"),
		target: elementTargetSchema,
		rate: z.number().finite().gt(0).lte(100),
		maintainPitch: z.boolean().optional(),
	}),
	z.object({
		op: z.literal("move"),
		target: elementTargetSchema,
		startTime: seconds,
		track: z.string().min(1).optional(),
	}),
	z.object({ op: z.literal("delete"), target: elementTargetSchema }),
	z.object({
		op: z.literal("duplicate"),
		target: elementTargetSchema,
		startTime: seconds.optional(),
	}),
	z.object({
		op: z.literal("set_params"),
		target: elementTargetSchema,
		params: z.record(z.string(), paramValue),
	}),
	z.object({
		op: z.literal("add_keyframe"),
		target: elementTargetSchema,
		param: z.string().min(1),
		time: seconds,
		value: paramValue,
		interpolation: z.enum(["linear", "hold", "ease"]).optional(),
	}),
	z.object({
		op: z.literal("add_effect"),
		target: elementTargetSchema,
		effectType: z.string().min(1),
	}),
	z.object({
		op: z.literal("add_mask"),
		target: elementTargetSchema,
		maskType: z.string().min(1),
	}),
	z.object({
		op: z.literal("add_track"),
		type: z.enum(["video", "text", "audio", "graphic", "effect"]),
		name: z.string().optional(),
	}),
]);

export type EditOp = z.infer<typeof editOpSchema>;
export type EditOpKind = EditOp["op"];

export const applyEditsInputSchema = z.object({
	ops: z.array(editOpSchema).min(1).max(500),
	label: z.string().optional(),
});

export type ApplyEditsInput = z.infer<typeof applyEditsInputSchema>;
```

`packages/agent-protocol/src/index.ts`:

```ts
export * from "./dto";
export * from "./ops";
export * from "./result";
```

- [ ] **Step 5: Write the failing test**

`packages/agent-protocol/src/__tests__/ops.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { editOpSchema, applyEditsInputSchema } from "../ops";

describe("editOpSchema", () => {
	test("defaults add_clip track to main", () => {
		const parsed = editOpSchema.parse({ op: "add_clip", mediaId: "m1" });
		expect(parsed).toMatchObject({ op: "add_clip", track: "main" });
	});

	test("rejects a negative start time", () => {
		expect(() =>
			editOpSchema.parse({ op: "add_text", text: "hi", startTime: -1, duration: 2 }),
		).toThrow();
	});

	test("rejects a zero or negative retime rate", () => {
		expect(() =>
			editOpSchema.parse({ op: "retime", target: { elementId: "e1" }, rate: 0 }),
		).toThrow();
	});

	test("accepts a back-reference target", () => {
		const parsed = editOpSchema.parse({
			op: "trim",
			target: { ref: 0 },
			trimStart: 1.5,
		});
		expect(parsed.op).toBe("trim");
	});

	test("rejects an unknown op", () => {
		expect(() => editOpSchema.parse({ op: "teleport" })).toThrow();
	});

	test("caps a batch at 500 ops", () => {
		const ops = Array.from({ length: 501 }, () => ({ op: "add_clip", mediaId: "m1" }));
		expect(() => applyEditsInputSchema.parse({ ops })).toThrow();
	});
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun test packages/agent-protocol`
Expected: FAIL — the module does not resolve yet if steps 2–4 were skipped; otherwise PASS once files exist. If it passes immediately, that is correct for this task: the schemas are pure data and the test is the specification.

- [ ] **Step 7: Wire the package into the web app**

In `apps/web/package.json`, add to `dependencies` (keep alphabetical order):

```json
"@opencut/agent-protocol": "workspace:*",
```

In `apps/web/next.config.ts`, add to the `nextConfig` object, immediately after `reactStrictMode: true,`:

```ts
	transpilePackages: ["@opencut/agent-protocol"],
```

Then install:

```bash
bun install
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `bun test packages/agent-protocol`
Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/agent-protocol apps/web/package.json apps/web/next.config.ts bun.lock
git commit -m "feat(agent): shared agent protocol package"
```

---

### Task 2: Time conversion and target resolution

The two pure helpers everything else depends on. Both are unit-testable without a browser.

**Files:**
- Create: `apps/web/src/agent/time.ts`
- Create: `apps/web/src/agent/targets.ts`
- Test: `apps/web/src/agent/__tests__/time.test.ts`
- Test: `apps/web/src/agent/__tests__/targets.test.ts`

**Interfaces:**
- Consumes: `ElementTarget` from `@opencut/agent-protocol`; `MediaTime`, `mediaTimeFromSeconds`, `TICKS_PER_SECOND` from `@/wasm`; `SceneTracks`, `TimelineTrack`, `TimelineElement` from `@/timeline/types`.
- Produces: `toMediaTime({ seconds })`, `toSeconds({ time })`, `listTracks({ tracks })`, `trackRefOf({ tracks, trackId })`, `resolveTrackRef({ tracks, ref })`, `resolveTarget({ tracks, target, refs })`, type `ResolvedElement`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/agent/__tests__/time.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { TICKS_PER_SECOND } from "@/wasm";
import { toMediaTime, toSeconds } from "../time";

describe("agent time conversion", () => {
	test("converts seconds to integer ticks", () => {
		expect(toMediaTime({ seconds: 2 })).toBe(2 * TICKS_PER_SECOND);
	});

	test("round-trips a fractional second", () => {
		const time = toMediaTime({ seconds: 1.5 });
		expect(toSeconds({ time })).toBeCloseTo(1.5, 6);
	});

	test("rejects a negative value", () => {
		expect(() => toMediaTime({ seconds: -0.1 })).toThrow();
	});

	test("rejects a non-finite value", () => {
		expect(() => toMediaTime({ seconds: Number.POSITIVE_INFINITY })).toThrow();
	});
});
```

`apps/web/src/agent/__tests__/targets.test.ts`:

```ts
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
	} as unknown as SceneTracks;
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test apps/web/src/agent`
Expected: FAIL with "Cannot find module '../time'".

- [ ] **Step 3: Implement the time helpers**

`apps/web/src/agent/time.ts`:

```ts
import { mediaTimeFromSeconds, TICKS_PER_SECOND, type MediaTime } from "@/wasm";

export function toMediaTime({ seconds }: { seconds: number }): MediaTime {
	if (!Number.isFinite(seconds)) {
		throw new Error(`Expected a finite number of seconds, got ${seconds}`);
	}
	if (seconds < 0) {
		throw new Error(`Expected a non-negative number of seconds, got ${seconds}`);
	}

	return mediaTimeFromSeconds({ seconds });
}

export function toSeconds({ time }: { time: MediaTime }): number {
	return time / TICKS_PER_SECOND;
}
```

- [ ] **Step 4: Implement target resolution**

`apps/web/src/agent/targets.ts`:

```ts
import type { ElementTarget } from "@opencut/agent-protocol";
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test apps/web/src/agent`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/agent
git commit -m "feat(agent): time conversion and target resolution"
```

---

### Task 3: Timeline serialization and read API

Turns editor state into the DTOs the MCP returns. The serializers are pure functions over `SceneTracks`, so they are unit-testable; the thin `read.ts` wrapper pulls state off `EditorCore`.

**Files:**
- Create: `apps/web/src/agent/serialize.ts`
- Create: `apps/web/src/agent/read.ts`
- Test: `apps/web/src/agent/__tests__/serialize.test.ts`

**Interfaces:**
- Consumes: `toSeconds`, `listTracks`, `trackRefOf` from Task 2; `ElementDTO`, `TrackDTO`, `TimelineDTO`, `ParamDefinitionDTO` from `@opencut/agent-protocol`.
- Produces: `serializeElement({ element, track, tracks, format })`, `serializeTracks({ tracks, format })`, `serializeTimeline({ scene, format })`, and from `read.ts`: `readProject()`, `readTimeline({ format })`, `findElements({ query })`, `describeParams({ elementType, elementId })`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/agent/__tests__/serialize.test.ts`:

```ts
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
	} as unknown as SceneTracks;
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/src/agent/__tests__/serialize.test.ts`
Expected: FAIL with "Cannot find module '../serialize'".

- [ ] **Step 3: Implement the serializers**

`apps/web/src/agent/serialize.ts`:

```ts
import type { ElementDTO, TrackDTO } from "@opencut/agent-protocol";
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/web/src/agent/__tests__/serialize.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Implement the read API**

`apps/web/src/agent/read.ts`:

```ts
import type {
	MediaAssetDTO,
	ParamDefinitionDTO,
	ProjectDTO,
	ProjectSummaryDTO,
	TimelineDTO,
} from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { getElementParams } from "@/params/registry";
import { storageService } from "@/services/storage/service";
import { readStorageQuotaStatus } from "@/services/storage/quota";
import type { ElementDTO } from "@opencut/agent-protocol";
import { listTracks, resolveTarget } from "./targets";
import { serializeElement, serializeTimeline, type SerializeFormat } from "./serialize";
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
		fps: project.settings.fps,
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
		},
	};
}

export function readTimeline({ format }: { format: SerializeFormat }): TimelineDTO {
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
			if (nameContains && !element.name.toLowerCase().includes(nameContains.toLowerCase())) {
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

	return getElementParams({ element }).map((param) => ({
		key: param.key,
		label: param.label,
		type: param.type,
		default: param.default,
		min: param.min,
		max: param.max,
		step: param.step,
		keyframable: param.keyframable !== false,
		options: param.options,
	}));
}
```

- [ ] **Step 6: Type-check**

Run: `cd apps/web && bunx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/agent/`. If `getElementParams`, `readStorageQuotaStatus` or a `ParamDefinition` field name differs from the above, fix the call site to match the real signature — do not change the registry.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/agent
git commit -m "feat(agent): timeline serialization and read API"
```

---

### Task 4: Atomic op execution

The heart of the system. Ops execute one at a time so later ops can reference elements earlier ops created; the whole run lands as a single undo entry; any refusal rolls the batch back.

**Files:**
- Create: `apps/web/src/agent/ops/build.ts`
- Create: `apps/web/src/agent/ops/verify.ts`
- Create: `apps/web/src/agent/ops/batch.ts`
- Create: `apps/web/src/agent/ops/index.ts`
- Test: `apps/web/src/agent/__tests__/verify.test.ts`

**Interfaces:**
- Consumes: `EditOp` from `@opencut/agent-protocol`; `resolveTarget`, `resolveTrackRef` from Task 2; `toMediaTime` from Task 2; commands from `@/commands/timeline`.
- Produces: `buildCommand({ op, tracks, refs })` returning `{ command, record }`; `assertApplied({ op, command, tracks })`; `AgentBatchCommand`; `applyEdits({ ops })` returning `{ elementIds: Array<string | null> }`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/agent/__tests__/verify.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { describeRefusal } from "../ops/verify";

describe("describeRefusal", () => {
	test("explains a refused insert", () => {
		expect(describeRefusal({ op: { op: "add_clip", mediaId: "m1", track: "main" } })).toMatch(
			/add_clip/,
		);
	});

	test("names the op kind for every op", () => {
		const message = describeRefusal({
			op: { op: "retime", target: { elementId: "e1" }, rate: 2 },
		});
		expect(message).toMatch(/retime/);
		expect(message).toMatch(/refused/i);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/src/agent/__tests__/verify.test.ts`
Expected: FAIL with "Cannot find module '../ops/verify'".

- [ ] **Step 3: Implement command building**

`apps/web/src/agent/ops/build.ts`:

```ts
import type { EditOp } from "@opencut/agent-protocol";
import type { Command } from "@/commands/base-command";
import {
	AddTrackCommand,
	DeleteElementsCommand,
	DuplicateElementsCommand,
	InsertElementCommand,
	MoveElementsCommand,
	SplitElementsCommand,
	UpdateElementsCommand,
} from "@/commands/timeline";
import { AddEffectCommand } from "@/commands/timeline/element/effects";
import { UpsertKeyframeCommand } from "@/commands/timeline/element/keyframes";
import { buildDefaultParamValues } from "@/params/registry";
import { elementParamRegistry } from "@/params/registry";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import type { SceneTracks, TrackType } from "@/timeline/types";
import { EditorCore } from "@/core";
import { mediaTime } from "@/wasm";
import { resolveTarget, resolveTrackRef } from "../targets";
import { toMediaTime } from "../time";

const ZERO = mediaTime({ ticks: 0 });

export interface BuiltOp {
	command: Command;
	/** Reads the element this op created, once the command has executed. */
	created?: () => { trackId: string; elementId: string } | null;
}

function trackTypeOf({ ref }: { ref: string }): TrackType | undefined {
	if (ref === "main") return "video";
	if (ref.startsWith("audio")) return "audio";
	if (ref.startsWith("overlay")) return undefined;
	return undefined;
}

export function buildCommand({
	op,
	tracks,
	refs,
}: {
	op: EditOp;
	tracks: SceneTracks;
	refs: Map<number, { trackId: string; elementId: string }>;
}): BuiltOp {
	switch (op.op) {
		case "add_clip": {
			const editor = EditorCore.getInstance();
			const asset = editor.media.getAssets().find((item) => item.id === op.mediaId);
			if (!asset) {
				throw new Error(`Media asset ${op.mediaId} not found`);
			}

			const duration =
				asset.duration !== undefined
					? toMediaTime({ seconds: asset.duration })
					: DEFAULT_NEW_ELEMENT_DURATION;

			const type = asset.type === "image" ? "image" : asset.type === "audio" ? "audio" : "video";
			const command = new InsertElementCommand({
				element: {
					type,
					name: op.name ?? asset.name,
					mediaId: op.mediaId,
					sourceType: type === "audio" ? "upload" : undefined,
					duration,
					startTime: op.startTime !== undefined ? toMediaTime({ seconds: op.startTime }) : ZERO,
					trimStart: op.trimStart !== undefined ? toMediaTime({ seconds: op.trimStart }) : ZERO,
					trimEnd: op.trimEnd !== undefined ? toMediaTime({ seconds: op.trimEnd }) : ZERO,
					params: buildDefaultParamValues(
						elementParamRegistry.get({ key: type })?.params ?? [],
					),
				} as never,
				placement:
					op.track === "main" || op.track === undefined
						? { mode: "auto", trackType: trackTypeOf({ ref: op.track ?? "main" }) }
						: { mode: "explicit", trackId: resolveTrackRef({ tracks, ref: op.track }).id },
			});

			return {
				command,
				created: () => {
					const trackId = command.getTrackId();
					return trackId ? { trackId, elementId: command.getElementId() } : null;
				},
			};
		}

		case "add_text": {
			const command = new InsertElementCommand({
				element: {
					type: "text",
					name: op.text.slice(0, 40) || "Text",
					duration: toMediaTime({ seconds: op.duration }),
					startTime: toMediaTime({ seconds: op.startTime }),
					trimStart: ZERO,
					trimEnd: ZERO,
					params: {
						...buildDefaultParamValues(
							elementParamRegistry.get({ key: "text" })?.params ?? [],
						),
						content: op.text,
						...op.params,
					},
				} as never,
				placement: op.track
					? { mode: "explicit", trackId: resolveTrackRef({ tracks, ref: op.track }).id }
					: { mode: "auto", trackType: "text" },
			});

			return {
				command,
				created: () => {
					const trackId = command.getTrackId();
					return trackId ? { trackId, elementId: command.getElementId() } : null;
				},
			};
		}

		case "split": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new SplitElementsCommand({
					elements: [{ trackId: resolved.trackId, elementId: resolved.elementId }],
					splitTime: toMediaTime({ seconds: op.atTime }),
					retainSide: op.retain,
				}),
			};
		}

		case "trim": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new UpdateElementsCommand({
					updates: [
						{
							trackId: resolved.trackId,
							elementId: resolved.elementId,
							patch: {
								...(op.trimStart !== undefined && {
									trimStart: toMediaTime({ seconds: op.trimStart }),
								}),
								...(op.trimEnd !== undefined && {
									trimEnd: toMediaTime({ seconds: op.trimEnd }),
								}),
							},
						},
					],
				}),
			};
		}

		case "retime": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new UpdateElementsCommand({
					updates: [
						{
							trackId: resolved.trackId,
							elementId: resolved.elementId,
							patch: {
								retime: { rate: op.rate, maintainPitch: op.maintainPitch },
							} as never,
						},
					],
				}),
			};
		}

		case "move": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			const targetTrackId = op.track
				? resolveTrackRef({ tracks, ref: op.track }).id
				: resolved.trackId;

			return {
				command: new MoveElementsCommand({
					moves: [
						{
							sourceTrackId: resolved.trackId,
							targetTrackId,
							elementId: resolved.elementId,
							newStartTime: toMediaTime({ seconds: op.startTime }),
						},
					],
				}),
			};
		}

		case "delete": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new DeleteElementsCommand({
					elements: [{ trackId: resolved.trackId, elementId: resolved.elementId }],
				}),
			};
		}

		case "duplicate": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			const command = new DuplicateElementsCommand({
				elements: [{ trackId: resolved.trackId, elementId: resolved.elementId }],
			});

			return {
				command,
				created: () => command.getDuplicatedElements()[0] ?? null,
			};
		}

		case "set_params": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new UpdateElementsCommand({
					updates: [
						{
							trackId: resolved.trackId,
							elementId: resolved.elementId,
							patch: {
								params: { ...resolved.element.params, ...op.params },
							},
						},
					],
				}),
			};
		}

		case "add_keyframe": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new UpsertKeyframeCommand({
					trackId: resolved.trackId,
					elementId: resolved.elementId,
					propertyPath: `params.${op.param}`,
					time: toMediaTime({ seconds: op.time }),
					value: op.value,
					interpolation: op.interpolation,
				}),
			};
		}

		case "add_effect": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new AddEffectCommand({
					trackId: resolved.trackId,
					elementId: resolved.elementId,
					effectType: op.effectType,
				}),
			};
		}

		case "add_mask": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new UpdateElementsCommand({
					updates: [
						{
							trackId: resolved.trackId,
							elementId: resolved.elementId,
							patch: { masks: [{ type: op.maskType }] } as never,
						},
					],
				}),
			};
		}

		case "add_track": {
			const command = new AddTrackCommand({ type: op.type });
			return {
				command,
				created: () => ({ trackId: command.getTrackId(), elementId: "" }),
			};
		}
	}
}
```

> **Note for the implementer:** `add_clip`, `add_text` and `add_mask` use `as never` casts because `CreateTimelineElement` is a discriminated union whose exact member depends on the runtime `type`. Before settling for the cast, try narrowing with a `switch` on `type` and building the correct union member directly — prefer that if it type-checks cleanly. `add_mask` in particular must build a real mask object with the params `masksRegistry` defines for `op.maskType`; read `apps/web/src/masks/registry.ts` and `apps/web/src/masks/types.ts` and construct the full `BaseMaskParams` plus per-type params rather than the `{ type }` stub shown above.

- [ ] **Step 4: Implement verification**

`apps/web/src/agent/ops/verify.ts`:

```ts
import type { EditOp } from "@opencut/agent-protocol";
import type { SceneTracks } from "@/timeline/types";
import { listTracks } from "../targets";

export function describeRefusal({ op }: { op: EditOp }): string {
	return `Editor refused the "${op.op}" operation. The command validated but did not apply — usually an incompatible track, an out-of-range time, or a missing media asset.`;
}

function elementExists({
	tracks,
	elementId,
}: {
	tracks: SceneTracks;
	elementId: string;
}): boolean {
	return listTracks({ tracks }).some((track) =>
		track.elements.some((element) => element.id === elementId),
	);
}

/**
 * Postcondition check. Commands signal refusal by returning undefined and
 * raising a toast, so the only reliable evidence an op applied is the state
 * it should have produced.
 */
export function assertApplied({
	op,
	created,
	tracksAfter,
	targetElementId,
}: {
	op: EditOp;
	created: { trackId: string; elementId: string } | null | undefined;
	tracksAfter: SceneTracks;
	targetElementId?: string;
}): void {
	switch (op.op) {
		case "add_clip":
		case "add_text":
		case "duplicate":
			if (!created || !elementExists({ tracks: tracksAfter, elementId: created.elementId })) {
				throw new Error(describeRefusal({ op }));
			}
			return;

		case "add_track":
			if (!created?.trackId) {
				throw new Error(describeRefusal({ op }));
			}
			return;

		case "delete":
			if (targetElementId && elementExists({ tracks: tracksAfter, elementId: targetElementId })) {
				throw new Error(describeRefusal({ op }));
			}
			return;

		default:
			if (targetElementId && !elementExists({ tracks: tracksAfter, elementId: targetElementId })) {
				throw new Error(describeRefusal({ op }));
			}
			return;
	}
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test apps/web/src/agent/__tests__/verify.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Implement the batch command**

`apps/web/src/agent/ops/batch.ts`:

```ts
import type { EditOp } from "@opencut/agent-protocol";
import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import { resolveTarget } from "../targets";
import { buildCommand } from "./build";
import { assertApplied } from "./verify";

export class AgentBatchCommand extends Command {
	private built: Command[] = [];
	private hasRun = false;
	public readonly refs = new Map<number, { trackId: string; elementId: string }>();

	constructor(private readonly ops: EditOp[]) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();

		if (this.hasRun) {
			for (const command of this.built) {
				command.redo();
			}
			return undefined;
		}

		for (const [index, op] of this.ops.entries()) {
			const tracksBefore = editor.scenes.getActiveScene().tracks;

			let targetElementId: string | undefined;
			if ("target" in op) {
				targetElementId = resolveTarget({
					tracks: tracksBefore,
					target: op.target,
					refs: this.refs,
				}).elementId;
			}

			const { command, created } = buildCommand({
				op,
				tracks: tracksBefore,
				refs: this.refs,
			});

			try {
				command.execute();
			} catch (error) {
				throw new Error(
					`Op ${index} ("${op.op}") threw: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: { failedAt: index } },
				);
			}

			const createdRef = created?.();
			try {
				assertApplied({
					op,
					created: createdRef,
					tracksAfter: editor.scenes.getActiveScene().tracks,
					targetElementId,
				});
			} catch (error) {
				this.built.push(command);
				throw new Error(
					`Op ${index}: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: { failedAt: index } },
				);
			}

			this.built.push(command);
			if (createdRef) {
				this.refs.set(index, createdRef);
			}
		}

		this.hasRun = true;
		return undefined;
	}

	undo(): void {
		for (const command of [...this.built].reverse()) {
			command.undo();
		}
	}

	rollbackPartial(): void {
		this.undo();
		this.built = [];
		this.refs.clear();
	}
}
```

- [ ] **Step 7: Implement the entry point**

`apps/web/src/agent/ops/index.ts`:

```ts
import type { EditOp } from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { AgentBatchCommand } from "./batch";

export * from "./batch";
export * from "./build";
export * from "./verify";

export interface ApplyEditsOutcome {
	appliedOps: number;
	createdElementIds: Array<{ opIndex: number; elementId: string; trackId: string }>;
}

export async function applyEdits({
	ops,
}: {
	ops: EditOp[];
}): Promise<ApplyEditsOutcome> {
	const editor = EditorCore.getInstance();
	const batch = new AgentBatchCommand(ops);

	try {
		editor.command.execute({ command: batch });
	} catch (error) {
		batch.rollbackPartial();
		throw error;
	}

	await editor.project.saveCurrentProject();

	return {
		appliedOps: ops.length,
		createdElementIds: [...batch.refs.entries()].map(([opIndex, ref]) => ({
			opIndex,
			elementId: ref.elementId,
			trackId: ref.trackId,
		})),
	};
}
```

- [ ] **Step 8: Type-check and commit**

Run: `cd apps/web && bunx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/agent/`. Fix any command constructor mismatches against the real signatures in `apps/web/src/commands/`.

```bash
git add apps/web/src/agent
git commit -m "feat(agent): atomic op execution with rollback"
```

---

### Task 5: Media import, the window facade, and mounting

Assembles everything into `window.__opencutAgent` and mounts it in the app behind the env flag.

**Files:**
- Create: `apps/web/src/agent/media.ts`
- Create: `apps/web/src/agent/ready.ts`
- Create: `apps/web/src/agent/api.ts`
- Create: `apps/web/src/agent/bridge.tsx`
- Create: `apps/web/src/agent/index.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/providers/editor-provider.tsx`
- Modify: `apps/web/.env.example`
- Modify: `turbo.json`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: the global `window.__opencutAgent` object with methods `version()`, `isReady()`, `listProjects()`, `createProject()`, `getProject()`, `getTimeline()`, `findElements()`, `describeParams()`, `applyEdits()`, `importMedia()`, `save()`. Every method returns `Promise<AgentResult<T>>`.

- [ ] **Step 1: Implement the readiness flag**

`apps/web/src/agent/ready.ts`:

```ts
let editorReady = false;
const waiters = new Set<() => void>();

export function setAgentEditorReady({ ready }: { ready: boolean }): void {
	editorReady = ready;
	if (ready) {
		for (const waiter of waiters) {
			waiter();
		}
		waiters.clear();
	}
}

export function isAgentEditorReady(): boolean {
	return editorReady;
}

export function waitForAgentEditor({
	timeoutMs = 30_000,
}: {
	timeoutMs?: number;
} = {}): Promise<void> {
	if (editorReady) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			waiters.delete(onReady);
			reject(new Error("Timed out waiting for the editor to finish loading"));
		}, timeoutMs);

		function onReady() {
			clearTimeout(timer);
			resolve();
		}

		waiters.add(onReady);
	});
}
```

- [ ] **Step 2: Implement media import**

`apps/web/src/agent/media.ts`:

```ts
import type { ImportResultDTO } from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { processMediaAssets } from "@/media/processing";

const INPUT_ID = "__opencut_agent_file_input";

function getInput(): HTMLInputElement {
	const existing = document.getElementById(INPUT_ID);
	if (existing instanceof HTMLInputElement) {
		return existing;
	}

	const input = document.createElement("input");
	input.id = INPUT_ID;
	input.type = "file";
	input.multiple = true;
	input.style.position = "fixed";
	input.style.left = "-10000px";
	input.style.width = "1px";
	input.style.height = "1px";
	document.body.appendChild(input);
	return input;
}

/**
 * Reads whatever Playwright placed on the hidden input and runs it through the
 * same pipeline the upload UI uses. `processMediaAssets` silently drops
 * unsupported and over-quota files, so results are reconciled by name against
 * what actually landed.
 */
export async function importStagedMedia(): Promise<ImportResultDTO[]> {
	const editor = EditorCore.getInstance();
	const projectId = editor.project.getActive().metadata.id;
	const input = getInput();
	const files = Array.from(input.files ?? []);

	if (files.length === 0) {
		throw new Error("No files were staged on the agent file input");
	}

	const processed = await processMediaAssets({ files });
	const results: ImportResultDTO[] = [];

	for (const file of files) {
		const match = processed.find((asset) => asset.file.name === file.name);
		if (!match) {
			results.push({
				path: file.name,
				ok: false,
				skipped: "Rejected during processing — unsupported type or insufficient browser storage",
			});
			continue;
		}

		const saved = await editor.media.addMediaAsset({ projectId, asset: match });
		if (!saved) {
			results.push({
				path: file.name,
				ok: false,
				skipped: "Failed to persist — browser storage quota exceeded",
			});
			continue;
		}

		results.push({
			path: file.name,
			ok: true,
			mediaId: saved.id,
			asset: {
				id: saved.id,
				name: saved.name,
				type: saved.type,
				durationSeconds: saved.duration,
				width: saved.width,
				height: saved.height,
				fps: saved.fps,
				hasAudio: saved.hasAudio,
			},
		});
	}

	input.value = "";
	return results;
}
```

- [ ] **Step 3: Assemble the API object**

`apps/web/src/agent/api.ts`:

```ts
import {
	applyEditsInputSchema,
	err,
	ok,
	type AgentResult,
} from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { importStagedMedia } from "./media";
import { applyEdits } from "./ops";
import { describeParams, findElements, listProjects, readProject, readTimeline } from "./read";
import { isAgentEditorReady, waitForAgentEditor } from "./ready";

export const AGENT_API_VERSION = 1;

async function guard<T>({
	needsEditor,
	run,
}: {
	needsEditor: boolean;
	run: () => Promise<T> | T;
}): Promise<AgentResult<T>> {
	try {
		if (needsEditor && !isAgentEditorReady()) {
			await waitForAgentEditor({ timeoutMs: 30_000 });
		}
		return ok({ value: await run() });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const cause = error instanceof Error ? error.cause : undefined;
		const code = /not found/i.test(message)
			? "not_found"
			: /quota|storage/i.test(message)
				? "storage_quota"
				: /refused|Op \d+/i.test(message)
					? "op_refused"
					: /timed out waiting for the editor/i.test(message)
						? "editor_not_ready"
						: "internal";

		return err({ code, message, details: cause });
	}
}

export function createAgentApi() {
	return {
		version: () => AGENT_API_VERSION,
		isReady: () => isAgentEditorReady(),

		listProjects: () => guard({ needsEditor: false, run: () => listProjects() }),

		getProject: () => guard({ needsEditor: true, run: () => readProject() }),

		getTimeline: ({ format }: { format?: "compact" | "full" } = {}) =>
			guard({
				needsEditor: true,
				run: () => readTimeline({ format: format ?? "compact" }),
			}),

		findElements: (query: Parameters<typeof findElements>[0]) =>
			guard({ needsEditor: true, run: () => findElements(query) }),

		describeParams: ({ elementId }: { elementId: string }) =>
			guard({ needsEditor: true, run: () => describeParams({ elementId }) }),

		applyEdits: (input: unknown) =>
			guard({
				needsEditor: true,
				run: async () => {
					const parsed = applyEditsInputSchema.safeParse(input);
					if (!parsed.success) {
						throw new Error(`Invalid edit ops: ${parsed.error.message}`);
					}
					return applyEdits({ ops: parsed.data.ops });
				},
			}),

		importMedia: () => guard({ needsEditor: true, run: () => importStagedMedia() }),

		configureProject: ({
			name,
			fps,
			canvasSize,
		}: {
			name?: string;
			fps?: number;
			canvasSize?: { width: number; height: number };
		}) =>
			guard({
				needsEditor: true,
				run: async () => {
					const editor = EditorCore.getInstance();
					const project = editor.project.getActive();

					if (name) {
						await editor.project.renameProject({ id: project.metadata.id, name });
					}
					if (fps !== undefined || canvasSize !== undefined) {
						await editor.project.updateSettings({
							settings: {
								...(fps !== undefined && { fps: fps as never }),
								...(canvasSize !== undefined && {
									canvasSize,
									canvasSizeMode: "custom" as const,
								}),
							},
						});
					}
					await editor.project.saveCurrentProject();
					return { id: project.metadata.id };
				},
			}),

		save: () =>
			guard({
				needsEditor: true,
				run: async () => {
					await EditorCore.getInstance().project.saveCurrentProject();
					return { saved: true };
				},
			}),
	};
}

export type AgentApi = ReturnType<typeof createAgentApi>;
```

- [ ] **Step 4: Implement the bridge component**

`apps/web/src/agent/index.ts`:

```ts
export { AgentBridge } from "./bridge";
export { setAgentEditorReady } from "./ready";
export { AGENT_API_VERSION, type AgentApi } from "./api";

export const AGENT_API_ENABLED =
	process.env.NEXT_PUBLIC_OPENCUT_AGENT_API === "1";
```

`apps/web/src/agent/bridge.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { createAgentApi, type AgentApi } from "./api";

declare global {
	interface Window {
		__opencutAgent?: AgentApi;
	}
}

export function AgentBridge() {
	useEffect(() => {
		if (process.env.NEXT_PUBLIC_OPENCUT_AGENT_API !== "1") {
			return;
		}
		if (window.__opencutAgent) {
			return;
		}

		window.__opencutAgent = createAgentApi();
		console.info("[opencut-agent] API installed");
	}, []);

	return null;
}
```

- [ ] **Step 5: Mount the bridge and signal readiness**

In `apps/web/src/app/layout.tsx`, add the import alongside the other imports:

```tsx
import { AgentBridge } from "@/agent";
```

and render it inside `<body>`, immediately before `{children}`:

```tsx
				<AgentBridge />
```

In `apps/web/src/components/providers/editor-provider.tsx`, add to the imports:

```tsx
import { setAgentEditorReady } from "@/agent";
```

and inside the `EditorRuntimeBindings` component, add this effect after the existing `useEffect` blocks and before `useEditorActions();`:

```tsx
	useEffect(() => {
		setAgentEditorReady({ ready: true });
		return () => setAgentEditorReady({ ready: false });
	}, []);
```

`EditorRuntimeBindings` renders only once `EditorProvider` has finished loading a project, so this is an exact readiness signal.

- [ ] **Step 6: Register the env flag**

Append to `apps/web/.env.example`:

```
# Set to 1 to expose window.__opencutAgent for the agent MCP server. Never enable in production.
NEXT_PUBLIC_OPENCUT_AGENT_API=0
```

In `turbo.json`, add `"NEXT_PUBLIC_OPENCUT_AGENT_API"` to the `build.env` array so the flag reaches production builds deterministically.

- [ ] **Step 7: Verify by hand**

```bash
NEXT_PUBLIC_OPENCUT_AGENT_API=1 bun dev:web
```

Open `http://localhost:3000/editor/00000000-0000-4000-8000-000000000000`, wait for the redirect to a real project id, then in the browser console:

```js
await window.__opencutAgent.getTimeline({ format: "compact" })
```

Expected: `{ ok: true, value: { sceneId: "...", tracks: [...] } }`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/agent apps/web/src/app/layout.tsx apps/web/src/components/providers/editor-provider.tsx apps/web/.env.example turbo.json
git commit -m "feat(agent): window facade, media import, and app mounting"
```

---

### Task 6: MCP server package and browser lifecycle

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/config.ts`
- Create: `packages/mcp-server/src/browser.ts`
- Create: `packages/mcp-server/src/bridge.ts`
- Create: `packages/mcp-server/README.md`
- Test: `packages/mcp-server/src/__tests__/config.test.ts`

**Interfaces:**
- Consumes: `@opencut/agent-protocol`.
- Produces: `loadConfig()`, `AgentBrowser` class with `ensureStarted()`, `openProject({ projectId })`, `createProject()`, `call({ method, args })`, `stageFiles({ paths })`, `handOff({ projectId })`, `close()`.

- [ ] **Step 1: Create the manifest**

`packages/mcp-server/package.json`:

```json
{
	"name": "@opencut/mcp-server",
	"version": "0.1.0",
	"private": true,
	"type": "module",
	"bin": {
		"opencut-mcp": "./src/index.ts"
	},
	"scripts": {
		"start": "bun run src/index.ts"
	},
	"dependencies": {
		"@modelcontextprotocol/server": "2.0.0",
		"@opencut/agent-protocol": "workspace:*",
		"playwright": "1.62.1",
		"zod": "4.3.6"
	}
}
```

`packages/mcp-server/tsconfig.json`: copy `packages/agent-protocol/tsconfig.json` verbatim, changing nothing.

- [ ] **Step 2: Write the failing config test**

`packages/mcp-server/src/__tests__/config.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { loadConfig } from "../config";

describe("loadConfig", () => {
	test("defaults to localhost:3000", () => {
		expect(loadConfig({ env: {} }).baseUrl).toBe("http://localhost:3000");
	});

	test("honours OPENCUT_BASE_URL", () => {
		expect(loadConfig({ env: { OPENCUT_BASE_URL: "http://localhost:3100" } }).baseUrl).toBe(
			"http://localhost:3100",
		);
	});

	test("strips a trailing slash", () => {
		expect(loadConfig({ env: { OPENCUT_BASE_URL: "http://localhost:3000/" } }).baseUrl).toBe(
			"http://localhost:3000",
		);
	});

	test("defaults the profile directory under the home directory", () => {
		expect(loadConfig({ env: { HOME: "/home/x" } }).profileDir).toBe("/home/x/.opencut-agent/profile");
	});
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test packages/mcp-server`
Expected: FAIL with "Cannot find module '../config'".

- [ ] **Step 4: Implement the config**

`packages/mcp-server/src/config.ts`:

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export interface AgentServerConfig {
	baseUrl: string;
	profileDir: string;
	lockFile: string;
	headless: boolean;
	viewport: { width: number; height: number };
	navigationTimeoutMs: number;
}

export function loadConfig({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): AgentServerConfig {
	const baseUrl = (env.OPENCUT_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
	const home = env.HOME ?? homedir();
	const root = env.OPENCUT_AGENT_HOME ?? join(home, ".opencut-agent");

	return {
		baseUrl,
		profileDir: join(root, "profile"),
		lockFile: join(root, "session.lock"),
		headless: env.OPENCUT_AGENT_HEADED !== "1",
		viewport: { width: 1600, height: 1000 },
		navigationTimeoutMs: 60_000,
	};
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bun test packages/mcp-server`
Expected: PASS, 4 tests.

- [ ] **Step 6: Implement the browser lifecycle**

`packages/mcp-server/src/browser.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { AgentResult } from "@opencut/agent-protocol";
import { loadConfig, type AgentServerConfig } from "./config";

const NEW_PROJECT_SEED = "00000000-0000-4000-8000-000000000000";

export class AgentBrowser {
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private readonly config: AgentServerConfig;

	constructor({ config = loadConfig() }: { config?: AgentServerConfig } = {}) {
		this.config = config;
	}

	private acquireLock(): void {
		const { lockFile } = this.config;
		mkdirSync(dirname(lockFile), { recursive: true });

		if (existsSync(lockFile)) {
			const pid = Number(readFileSync(lockFile, "utf8").trim());
			let alive = false;
			try {
				process.kill(pid, 0);
				alive = true;
			} catch {
				alive = false;
			}

			if (alive && pid !== process.pid) {
				throw new Error(
					`Another OpenCut agent session (pid ${pid}) already owns the browser profile at ${this.config.profileDir}. Close it before starting a new one.`,
				);
			}
			rmSync(lockFile, { force: true });
		}

		writeFileSync(lockFile, String(process.pid), "utf8");
	}

	private async assertDevServer(): Promise<void> {
		try {
			const response = await fetch(`${this.config.baseUrl}/api/health`);
			if (!response.ok) {
				throw new Error(`status ${response.status}`);
			}
		} catch (error) {
			throw new Error(
				`OpenCut is not reachable at ${this.config.baseUrl}. Start it with "NEXT_PUBLIC_OPENCUT_AGENT_API=1 bun dev:web" and try again. (${error instanceof Error ? error.message : String(error)})`,
			);
		}
	}

	async ensureStarted({ headless }: { headless?: boolean } = {}): Promise<Page> {
		if (this.page && !this.page.isClosed()) {
			return this.page;
		}

		await this.assertDevServer();
		this.acquireLock();
		mkdirSync(this.config.profileDir, { recursive: true });

		this.context = await chromium.launchPersistentContext(this.config.profileDir, {
			headless: headless ?? this.config.headless,
			viewport: this.config.viewport,
			args: ["--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
		});

		this.page = this.context.pages()[0] ?? (await this.context.newPage());
		this.page.setDefaultTimeout(this.config.navigationTimeoutMs);
		this.page.on("dialog", (dialog) => void dialog.dismiss());

		return this.page;
	}

	/** Navigates to a project and waits for the agent API to report the editor ready. */
	async openProject({ projectId }: { projectId: string }): Promise<string> {
		const page = await this.ensureStarted();
		await page.goto(`${this.config.baseUrl}/editor/${projectId}`, {
			waitUntil: "domcontentloaded",
		});

		await page.waitForFunction(
			() => window.__opencutAgent?.isReady() === true,
			undefined,
			{ timeout: this.config.navigationTimeoutMs },
		);

		const url = new URL(page.url());
		return url.pathname.split("/").pop() ?? projectId;
	}

	/**
	 * Bootstraps a project by navigating to an id that cannot exist. The editor
	 * treats a missing project as a signal to create "Untitled Project" and
	 * redirect to its real id — a path the app already supports for humans.
	 */
	async createProject(): Promise<string> {
		return this.openProject({ projectId: NEW_PROJECT_SEED });
	}

	async call<T>({
		method,
		args,
	}: {
		method: string;
		args?: unknown;
	}): Promise<T> {
		const page = await this.ensureStarted();

		const result = (await page.evaluate(
			async ({ method: name, args: payload }) => {
				const api = window.__opencutAgent as unknown as
					| Record<string, (input?: unknown) => Promise<unknown>>
					| undefined;
				if (!api) {
					return {
						ok: false,
						error: { code: "editor_not_ready", message: "Agent API is not installed on this page" },
					};
				}
				const fn = api[name];
				if (typeof fn !== "function") {
					return {
						ok: false,
						error: { code: "unsupported", message: `Unknown agent method "${name}"` },
					};
				}
				return fn(payload);
			},
			{ method, args },
		)) as AgentResult<T>;

		if (!result.ok) {
			throw new Error(`[${result.error.code}] ${result.error.message}`);
		}

		return result.value;
	}

	async stageFiles({ paths }: { paths: string[] }): Promise<void> {
		const page = await this.ensureStarted();
		await page.evaluate(() => {
			const id = "__opencut_agent_file_input";
			if (document.getElementById(id)) return;
			const input = document.createElement("input");
			input.id = id;
			input.type = "file";
			input.multiple = true;
			input.style.position = "fixed";
			input.style.left = "-10000px";
			document.body.appendChild(input);
		});
		await page.setInputFiles("#__opencut_agent_file_input", paths);
	}

	async handOff({ projectId }: { projectId: string }): Promise<string> {
		await this.call({ method: "save" });
		await this.close();

		await this.ensureStarted({ headless: false });
		const finalId = await this.openProject({ projectId });
		return `${this.config.baseUrl}/editor/${finalId}`;
	}

	async close(): Promise<void> {
		await this.context?.close();
		this.context = null;
		this.page = null;
		rmSync(this.config.lockFile, { force: true });
	}
}
```

- [ ] **Step 7: Install and commit**

```bash
bun install
bunx playwright install chromium
git add packages/mcp-server bun.lock
git commit -m "feat(mcp): server package and browser lifecycle"
```

---

### Task 7: Tool registration and the stdio entrypoint

Closes the loop. Task 6 gave the server a browser; this gives it a tool surface an
MCP client can actually call, and a process that speaks stdio.

**Files:**
- Create: `packages/mcp-server/src/session.ts`
- Create: `packages/mcp-server/src/tools.ts`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/README.md`
- Test: `packages/mcp-server/src/__tests__/tools.test.ts`

**Interfaces:**
- Consumes: `AgentBrowser` and `loadConfig` from Task 6; `applyEditsInputSchema` from `@opencut/agent-protocol`.
- Produces: `AgentSession` (browser plus the active project id), `registerTools({ server, session })`, and a `serveStdio` entrypoint.

**SDK shape (verified against `@modelcontextprotocol/server@2.0.0`):**
`new McpServer({ name, version }, { capabilities: { tools: {} } })`,
`server.registerTool(name, { title, description, inputSchema: <zod object> }, handler)`,
and `serveStdio(factory)` from `@modelcontextprotocol/server/stdio`. Handlers return
`{ content: [{ type: "text", text }], structuredContent? }`.

- [ ] **Step 1: Track the active project**

The browser is stateless about which project is open; `hand_off` and every editing
tool need that id. `session.ts` holds it, and refuses editing tools before
`create_project` or `open_project` has run — a clearer failure than a timeout.

- [ ] **Step 2: Write the failing test**

`packages/mcp-server/src/__tests__/tools.test.ts` asserts the tool surface is
exactly the ten tools the design names, and that `apply_edits` rejects a malformed
op before touching the browser.

- [ ] **Step 3: Register the tools**

Ten tools, thin over `AgentBrowser.call`. Every handler funnels through one
`respond` helper so a thrown error becomes `isError: true` with the message rather
than a protocol-level failure.

- [ ] **Step 4: Write the entrypoint**

`serveStdio` with a factory that builds one `McpServer`, one `AgentSession`, and
registers the tools. The browser launches lazily on the first tool call.

- [ ] **Step 5: Run the tests and commit**

```bash
bun test packages/mcp-server
git add packages/mcp-server
git commit -m "feat(mcp): tool registration and stdio entrypoint"
```

---

### Task 8: The orchestrating skill

A Claude Code skill that drives the MCP end to end: script, media generation via
the existing media skills, `apply_edits` assembly, handoff URL. Out of scope for
this repo — it lives in `~/.claude/skills/` and is specified separately once the
MCP has been exercised by hand.
