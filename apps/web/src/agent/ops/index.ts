import type { EditOp } from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { AgentBatchCommand } from "./batch";

export * from "./batch";
export * from "./build";
export * from "./verify";

export interface ApplyEditsOutcome {
	appliedOps: number;
	createdElementIds: Array<{
		opIndex: number;
		elementId: string;
		trackId: string;
	}>;
}

export async function applyEdits({
	ops,
}: {
	ops: EditOp[];
}): Promise<ApplyEditsOutcome> {
	const editor = EditorCore.getInstance();
	const batch = new AgentBatchCommand(ops);

	try {
		editor.command.execute({ command: batch });
	} catch (error) {
		batch.rollbackPartial();
		throw error;
	}

	// SaveManager autosaves on a timer; headless, a handoff can outrun it.
	await editor.project.saveCurrentProject();

	return {
		appliedOps: ops.length,
		createdElementIds: [...batch.refs.entries()].map(([opIndex, ref]) => ({
			opIndex,
			elementId: ref.elementId,
			trackId: ref.trackId,
		})),
	};
}
