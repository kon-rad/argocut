import type { EditOp } from "@argocut/agent-protocol";
import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import { resolveTarget } from "../targets";
import { buildCommand } from "./build";
import { assertApplied } from "./verify";

export interface AgentBatchFailure {
	failedAt: number;
}

function failureAt({ index }: { index: number }): AgentBatchFailure {
	return { failedAt: index };
}

/**
 * One agent action, one undo step.
 *
 * Ops execute one at a time — each is built against the tracks the previous op
 * left behind, so a later op can address an element an earlier one created. The
 * whole run lands on the undo stack as a single entry.
 */
export class AgentBatchCommand extends Command {
	private built: Command[] = [];
	private hasRun = false;
	public readonly refs = new Map<
		number,
		{ trackId: string; elementId: string }
	>();

	constructor(private readonly ops: EditOp[]) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();

		if (this.hasRun) {
			for (const command of this.built) {
				command.redo();
			}
			return undefined;
		}

		for (const [index, op] of this.ops.entries()) {
			const tracksBefore = editor.scenes.getActiveScene().tracks;

			let targetElementId: string | undefined;
			if ("target" in op) {
				targetElementId = resolveTarget({
					tracks: tracksBefore,
					target: op.target,
					refs: this.refs,
				}).elementId;
			}

			const { command, created } = buildCommand({
				op,
				tracks: tracksBefore,
				refs: this.refs,
			});

			try {
				command.execute();
			} catch (error) {
				throw new Error(
					`Op ${index} ("${op.op}") threw: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: failureAt({ index }) },
				);
			}

			// The command ran, so it owns state that must be undone on rollback —
			// record it before the postcondition check can throw.
			this.built.push(command);

			const createdRef = created?.();
			try {
				assertApplied({
					op,
					created: createdRef,
					tracksAfter: editor.scenes.getActiveScene().tracks,
					targetElementId,
				});
			} catch (error) {
				throw new Error(
					`Op ${index}: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: failureAt({ index }) },
				);
			}

			if (createdRef) {
				this.refs.set(index, createdRef);
			}
		}

		this.hasRun = true;
		return undefined;
	}

	undo(): void {
		for (const command of [...this.built].reverse()) {
			command.undo();
		}
	}

	/** Unwind a batch that threw mid-run, leaving nothing on the undo stack. */
	rollbackPartial(): void {
		this.undo();
		this.built = [];
		this.refs.clear();
	}
}
