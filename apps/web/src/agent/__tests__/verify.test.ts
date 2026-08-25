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
