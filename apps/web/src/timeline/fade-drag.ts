import { clamp } from "@/utils/math";

/**
 * Clamps a dragged fade duration so fade-in and fade-out can never overlap
 * past the clip's own length.
 */
export function clampFadeDuration({
	rawSeconds,
	otherFadeSeconds,
	clipDurationSeconds,
}: {
	rawSeconds: number;
	otherFadeSeconds: number;
	clipDurationSeconds: number;
}): number {
	const maxAllowed = Math.max(0, clipDurationSeconds - otherFadeSeconds);
	return clamp({ value: rawSeconds, min: 0, max: maxAllowed });
}
