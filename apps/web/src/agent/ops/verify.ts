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
			if (
				!created ||
				!elementExists({ tracks: tracksAfter, elementId: created.elementId })
			) {
				throw new Error(describeRefusal({ op }));
			}
			return;

		case "add_track":
			if (!created?.trackId) {
				throw new Error(describeRefusal({ op }));
			}
			return;

		case "delete":
			if (
				targetElementId &&
				elementExists({ tracks: tracksAfter, elementId: targetElementId })
			) {
				throw new Error(describeRefusal({ op }));
			}
			return;

		case "split":
			// A split retaining one side removes the original id; retaining both
			// keeps the left half under it. Either way the track must still hold
			// something, so only the "both" case has a checkable postcondition.
			if (
				op.retain === "both" &&
				targetElementId &&
				!elementExists({ tracks: tracksAfter, elementId: targetElementId })
			) {
				throw new Error(describeRefusal({ op }));
			}
			return;

		default:
			if (
				targetElementId &&
				!elementExists({ tracks: tracksAfter, elementId: targetElementId })
			) {
				throw new Error(describeRefusal({ op }));
			}
			return;
	}
}
