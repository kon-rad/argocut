import type { EditOp } from "@opencut/agent-protocol";
import type { Command } from "@/commands/base-command";
import {
	AddClipEffectCommand,
	AddTrackCommand,
	DeleteElementsCommand,
	DuplicateElementsCommand,
	InsertElementCommand,
	MoveElementCommand,
	SplitElementsCommand,
	UpdateElementsCommand,
	UpsertKeyframeCommand,
} from "@/commands/timeline";
import { EditorCore } from "@/core";
import { buildDefaultMaskInstance, masksRegistry } from "@/masks";
import type { Mask, MaskType } from "@/masks/types";
import type { ParamValues } from "@/params";
import {
	buildDefaultParamValues,
	getBuiltInElementParams,
} from "@/params/registry";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import type {
	CreateTimelineElement,
	ElementType,
	SceneTracks,
	TrackType,
} from "@/timeline/types";
import { ZERO_MEDIA_TIME } from "@/wasm";
import { resolveTarget, resolveTrackRef } from "../targets";
import { toMediaTime } from "../time";

export interface BuiltOp {
	command: Command;
	/** Reads the element this op created, once the command has executed. */
	created?: () => { trackId: string; elementId: string } | null;
}

function defaultParamsFor({ type }: { type: ElementType }): ParamValues {
	return buildDefaultParamValues(getBuiltInElementParams({ type }));
}

/**
 * `maskType` arrives as a free string over the wire. Narrow it against the
 * registry so an unknown type is a clear error rather than a cast that blows up
 * inside `buildDefault`.
 */
function requireMaskType({ maskType }: { maskType: string }): MaskType {
	const registered = masksRegistry.getAll();
	const match = registered.find((definition) => definition.type === maskType);
	if (!match) {
		throw new Error(
			`Unknown mask type "${maskType}". Registered types: ${registered
				.map((definition) => definition.type)
				.join(", ")}`,
		);
	}
	return match.type;
}

function trackTypeForRef({ ref }: { ref: string }): TrackType | undefined {
	if (ref === "main") return "video";
	if (ref.startsWith("audio")) return "audio";
	return undefined;
}

/**
 * `add_clip` builds the correct `CreateTimelineElement` union member per media
 * type rather than casting — the audio member carries `sourceType`, the visual
 * ones do not.
 */
function buildClipElement({
	op,
	asset,
}: {
	op: Extract<EditOp, { op: "add_clip" }>;
	asset: { id: string; name: string; type: "image" | "video" | "audio"; duration?: number };
}): CreateTimelineElement {
	const common = {
		name: op.name ?? asset.name,
		duration:
			asset.duration !== undefined
				? toMediaTime({ seconds: asset.duration })
				: DEFAULT_NEW_ELEMENT_DURATION,
		startTime:
			op.startTime !== undefined
				? toMediaTime({ seconds: op.startTime })
				: ZERO_MEDIA_TIME,
		trimStart:
			op.trimStart !== undefined
				? toMediaTime({ seconds: op.trimStart })
				: ZERO_MEDIA_TIME,
		trimEnd:
			op.trimEnd !== undefined
				? toMediaTime({ seconds: op.trimEnd })
				: ZERO_MEDIA_TIME,
	};

	switch (asset.type) {
		case "audio":
			return {
				...common,
				type: "audio",
				sourceType: "upload",
				mediaId: op.mediaId,
				params: defaultParamsFor({ type: "audio" }),
			};
		case "image":
			return {
				...common,
				type: "image",
				mediaId: op.mediaId,
				params: defaultParamsFor({ type: "image" }),
			};
		case "video":
			return {
				...common,
				type: "video",
				mediaId: op.mediaId,
				params: defaultParamsFor({ type: "video" }),
			};
	}
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
			const asset = editor.media
				.getAssets()
				.find((item) => item.id === op.mediaId);
			if (!asset) {
				throw new Error(`Media asset ${op.mediaId} not found`);
			}

			const command = new InsertElementCommand({
				element: buildClipElement({ op, asset }),
				placement:
					op.track === "main"
						? { mode: "auto", trackType: trackTypeForRef({ ref: op.track }) }
						: {
								mode: "explicit",
								trackId: resolveTrackRef({ tracks, ref: op.track }).id,
							},
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
					trimStart: ZERO_MEDIA_TIME,
					trimEnd: ZERO_MEDIA_TIME,
					params: {
						...defaultParamsFor({ type: "text" }),
						content: op.text,
						...op.params,
					},
				},
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
							},
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
				command: new MoveElementCommand({
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
					// Element params are addressed by bare key — `resolveAnimationTarget`
					// tries the param registry before any dotted graphic/effect path.
					trackId: resolved.trackId,
					elementId: resolved.elementId,
					propertyPath: op.param,
					time: toMediaTime({ seconds: op.time }),
					value: op.value,
					interpolation: op.interpolation,
				}),
			};
		}

		case "add_effect": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			return {
				command: new AddClipEffectCommand({
					trackId: resolved.trackId,
					elementId: resolved.elementId,
					effectType: op.effectType,
				}),
			};
		}

		case "add_mask": {
			const resolved = resolveTarget({ tracks, target: op.target, refs });
			const existing =
				"masks" in resolved.element ? (resolved.element.masks ?? []) : [];
			const mask: Mask = buildDefaultMaskInstance({
				maskType: requireMaskType({ maskType: op.maskType }),
			});

			return {
				command: new UpdateElementsCommand({
					updates: [
						{
							trackId: resolved.trackId,
							elementId: resolved.elementId,
							patch: { masks: [...existing, mask] },
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
