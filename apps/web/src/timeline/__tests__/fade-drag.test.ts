import { describe, expect, test } from "bun:test";
import { clampFadeDuration } from "@/timeline/fade-drag";

describe("clampFadeDuration", () => {
	test("passes through a value that fits within the clip", () => {
		expect(
			clampFadeDuration({
				rawSeconds: 2,
				otherFadeSeconds: 1,
				clipDurationSeconds: 10,
			}),
		).toBe(2);
	});

	test("never returns a negative duration", () => {
		expect(
			clampFadeDuration({
				rawSeconds: -3,
				otherFadeSeconds: 0,
				clipDurationSeconds: 10,
			}),
		).toBe(0);
	});

	test("caps at the remaining space after the other fade", () => {
		expect(
			clampFadeDuration({
				rawSeconds: 9,
				otherFadeSeconds: 4,
				clipDurationSeconds: 10,
			}),
		).toBe(6);
	});

	test("caps at zero when the other fade already fills the clip", () => {
		expect(
			clampFadeDuration({
				rawSeconds: 5,
				otherFadeSeconds: 10,
				clipDurationSeconds: 10,
			}),
		).toBe(0);
	});
});
