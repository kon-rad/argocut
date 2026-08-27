import { describe, expect, test } from "bun:test";
import { applyEditsInputSchema } from "@argocut/agent-protocol";
import { TOOL_NAMES } from "../tools";

describe("tool surface", () => {
	test("exposes exactly the ten tools the design names", () => {
		expect([...TOOL_NAMES]).toEqual([
			"list_projects",
			"create_project",
			"open_project",
			"import_media",
			"get_project",
			"get_timeline",
			"find_elements",
			"describe_params",
			"apply_edits",
			"hand_off",
		]);
	});
});

describe("apply_edits input", () => {
	test("rejects a malformed op before the browser is touched", () => {
		expect(
			applyEditsInputSchema.safeParse({ ops: [{ op: "teleport" }] }).success,
		).toBe(false);
	});

	test("accepts a batch that back-references an earlier op", () => {
		const parsed = applyEditsInputSchema.safeParse({
			ops: [
				{ op: "add_clip", mediaId: "m1" },
				{ op: "trim", target: { ref: 0 }, trimStart: 0.5 },
			],
		});
		expect(parsed.success).toBe(true);
	});
});
