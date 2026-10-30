import { describe, expect, test } from "bun:test";
import type { AudioElement } from "@/timeline";
import {
	getElementFadeInDuration,
	getElementFadeOutDuration,
	hasFade,
	needsGainAutomation,
	resolveEffectiveAudioGain,
} from "@/timeline/audio-state";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";

function buildAudioElement({
	durationSeconds,
	volume = 0,
	fadeInDuration,
	fadeOutDuration,
}: {
	durationSeconds: number;
	volume?: number;
	fadeInDuration?: number;
	fadeOutDuration?: number;
}): AudioElement {
	return {
		id: "audio-1",
		type: "audio",
		sourceType: "library",
		sourceUrl: "library://track-1",
		name: "Track 1",
		startTime: ZERO_MEDIA_TIME,
		duration: mediaTime({ ticks: Math.round(durationSeconds * 60_000) }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {
			volume,
			muted: false,
			...(fadeInDuration !== undefined ? { fadeInDuration } : {}),
			...(fadeOutDuration !== undefined ? { fadeOutDuration } : {}),
		},
	};
}

describe("fade duration accessors", () => {
	test("getElementFadeInDuration defaults to 0 when unset", () => {
		const element = buildAudioElement({ durationSeconds: 10 });
		expect(getElementFadeInDuration({ element })).toBe(0);
	});

	test("getElementFadeOutDuration reads the stored value", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeOutDuration: 2.5 });
		expect(getElementFadeOutDuration({ element })).toBe(2.5);
	});

	test("hasFade is false when both durations are zero", () => {
		const element = buildAudioElement({ durationSeconds: 10 });
		expect(hasFade({ element })).toBe(false);
	});

	test("hasFade is true when only fadeInDuration is set", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeInDuration: 1 });
		expect(hasFade({ element })).toBe(true);
	});
});

describe("resolveEffectiveAudioGain with fades", () => {
	test("is silent at the very start of a fade-in", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeInDuration: 2 });
		expect(resolveEffectiveAudioGain({ element, localTime: 0 })).toBeCloseTo(0, 5);
	});

	test("ramps linearly halfway through a fade-in", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeInDuration: 2 });
		const fullGain = resolveEffectiveAudioGain({ element, localTime: 5 });
		const halfwayGain = resolveEffectiveAudioGain({ element, localTime: 1 });
		expect(halfwayGain).toBeCloseTo(fullGain * 0.5, 5);
	});

	test("reaches full gain once past the fade-in window", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeInDuration: 2 });
		const gainAtEdge = resolveEffectiveAudioGain({ element, localTime: 2 });
		const gainWellPast = resolveEffectiveAudioGain({ element, localTime: 8 });
		expect(gainAtEdge).toBeCloseTo(gainWellPast, 5);
	});

	test("is silent at the very end of a fade-out", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeOutDuration: 2 });
		expect(resolveEffectiveAudioGain({ element, localTime: 10 })).toBeCloseTo(0, 5);
	});

	test("ramps linearly halfway through a fade-out", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeOutDuration: 2 });
		const fullGain = resolveEffectiveAudioGain({ element, localTime: 5 });
		const halfwayGain = resolveEffectiveAudioGain({ element, localTime: 9 });
		expect(halfwayGain).toBeCloseTo(fullGain * 0.5, 5);
	});

	test("composes multiplicatively with the base volume in dB", () => {
		const withoutFade = buildAudioElement({ durationSeconds: 10, volume: -6 });
		const withFade = buildAudioElement({
			durationSeconds: 10,
			volume: -6,
			fadeInDuration: 2,
		});
		const baseGain = resolveEffectiveAudioGain({ element: withoutFade, localTime: 1 });
		const fadedGain = resolveEffectiveAudioGain({ element: withFade, localTime: 1 });
		expect(fadedGain).toBeCloseTo(baseGain * 0.5, 5);
	});

	test("is unaffected when neither fade duration is set", () => {
		const withFadeFields = buildAudioElement({
			durationSeconds: 10,
			fadeInDuration: 0,
			fadeOutDuration: 0,
		});
		const withoutFadeFields = buildAudioElement({ durationSeconds: 10 });
		expect(resolveEffectiveAudioGain({ element: withFadeFields, localTime: 5 })).toBe(
			resolveEffectiveAudioGain({ element: withoutFadeFields, localTime: 5 }),
		);
	});

	test("clamps combined fade-in and fade-out that exceed the clip duration", () => {
		const element = buildAudioElement({
			durationSeconds: 10,
			fadeInDuration: 8,
			fadeOutDuration: 8,
		});
		const gain = resolveEffectiveAudioGain({ element, localTime: 5 });
		expect(gain).toBeGreaterThanOrEqual(0);
		expect(gain).toBeLessThanOrEqual(
			resolveEffectiveAudioGain({
				element: buildAudioElement({ durationSeconds: 10 }),
				localTime: 5,
			}),
		);
	});
});

describe("needsGainAutomation", () => {
	test("is false for a plain clip with no keyframes or fades", () => {
		const element = buildAudioElement({ durationSeconds: 10 });
		expect(needsGainAutomation({ element })).toBe(false);
	});

	test("is true when a fade-in is set", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeInDuration: 1 });
		expect(needsGainAutomation({ element })).toBe(true);
	});

	test("is true when a fade-out is set", () => {
		const element = buildAudioElement({ durationSeconds: 10, fadeOutDuration: 1 });
		expect(needsGainAutomation({ element })).toBe(true);
	});
});
