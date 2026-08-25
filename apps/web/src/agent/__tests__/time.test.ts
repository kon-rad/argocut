import { describe, expect, test } from "bun:test";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";
import { toMediaTime, toSeconds } from "../time";

describe("agent time conversion", () => {
	test("converts seconds to integer ticks", () => {
		expect(toMediaTime({ seconds: 2 })).toBe(mediaTime({ ticks: 2 * TICKS_PER_SECOND }));
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
