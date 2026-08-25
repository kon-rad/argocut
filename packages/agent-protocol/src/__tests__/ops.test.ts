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
