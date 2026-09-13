import { describe, expect, test } from "bun:test";
import { buildColorGradingUniforms } from "@/effects/definitions/color-grading";

describe("buildColorGradingUniforms", () => {
	test("maps default (neutral) params to zeroed uniforms", () => {
		const uniforms = buildColorGradingUniforms({
			effectParams: {},
			width: 1920,
			height: 1080,
		});

		expect(uniforms).toEqual({
			u_brightness: 0,
			u_contrast: 0,
			u_saturation: 0,
			u_temperature: 0,
			u_tint: 0,
			u_highlights: 0,
			u_shadows: 0,
			u_vignette: 0,
		});
	});

	test("normalizes -100..100 params to -1..1 uniforms", () => {
		const uniforms = buildColorGradingUniforms({
			effectParams: { brightness: 50, contrast: -25 },
			width: 1920,
			height: 1080,
		});

		expect(uniforms.u_brightness).toBe(0.5);
		expect(uniforms.u_contrast).toBe(-0.25);
	});

	test("normalizes 0..100 vignette to 0..1", () => {
		const uniforms = buildColorGradingUniforms({
			effectParams: { vignette: 100 },
			width: 1920,
			height: 1080,
		});

		expect(uniforms.u_vignette).toBe(1);
	});
});
