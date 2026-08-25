import {
	applyEditsInputSchema,
	err,
	ok,
	type AgentErrorCode,
	type AgentResult,
} from "@opencut/agent-protocol";
import { EditorCore } from "@/core";
import { floatToFrameRate } from "@/fps/utils";
import { importStagedMedia } from "./media";
import { applyEdits } from "./ops";
import {
	describeParams,
	findElements,
	listProjects,
	readProject,
	readTimeline,
} from "./read";
import { isAgentEditorReady, waitForAgentEditor } from "./ready";
import { AGENT_API_VERSION } from "./version";

function classify({ message }: { message: string }): AgentErrorCode {
	if (/timed out waiting for the editor/i.test(message)) return "editor_not_ready";
	if (/quota|storage/i.test(message)) return "storage_quota";
	if (/refused|^Op \d+/i.test(message)) return "op_refused";
	if (/not found/i.test(message)) return "not_found";
	if (/invalid|expected/i.test(message)) return "invalid_argument";
	return "internal";
}

/**
 * Nothing crosses the `page.evaluate` boundary as an exception — error classes
 * do not survive structured cloning. Every method resolves to a plain
 * `AgentResult` instead.
 */
async function guard<T>({
	needsEditor,
	run,
}: {
	needsEditor: boolean;
	run: () => Promise<T> | T;
}): Promise<AgentResult<T>> {
	try {
		if (needsEditor && !isAgentEditorReady()) {
			await waitForAgentEditor({ timeoutMs: 30_000 });
		}
		return ok({ value: await run() });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const cause = error instanceof Error ? error.cause : undefined;
		return err({ code: classify({ message }), message, details: cause });
	}
}

export function createAgentApi() {
	return {
		version: () => AGENT_API_VERSION,
		isReady: () => isAgentEditorReady(),

		listProjects: () => guard({ needsEditor: false, run: () => listProjects() }),

		createProject: ({ name }: { name: string }) =>
			guard({
				needsEditor: false,
				run: async () => ({
					id: await EditorCore.getInstance().project.createNewProject({ name }),
				}),
			}),

		getProject: () => guard({ needsEditor: true, run: () => readProject() }),

		getTimeline: ({ format }: { format?: "compact" | "full" } = {}) =>
			guard({
				needsEditor: true,
				run: () => readTimeline({ format: format ?? "compact" }),
			}),

		findElements: (query: Parameters<typeof findElements>[0]) =>
			guard({ needsEditor: true, run: () => findElements(query) }),

		describeParams: ({ elementId }: { elementId: string }) =>
			guard({ needsEditor: true, run: () => describeParams({ elementId }) }),

		applyEdits: (input: unknown) =>
			guard({
				needsEditor: true,
				run: async () => {
					const parsed = applyEditsInputSchema.safeParse(input);
					if (!parsed.success) {
						throw new Error(`Invalid edit ops: ${parsed.error.message}`);
					}
					return applyEdits({ ops: parsed.data.ops });
				},
			}),

		importMedia: () =>
			guard({ needsEditor: true, run: () => importStagedMedia() }),

		configureProject: ({
			name,
			fps,
			canvasSize,
		}: {
			name?: string;
			fps?: number;
			canvasSize?: { width: number; height: number };
		}) =>
			guard({
				needsEditor: true,
				run: async () => {
					const editor = EditorCore.getInstance();
					const project = editor.project.getActive();

					if (name) {
						await editor.project.renameProject({
							id: project.metadata.id,
							name,
						});
					}
					if (fps !== undefined || canvasSize !== undefined) {
						await editor.project.updateSettings({
							settings: {
								// fps is a rational in the editor; take a decimal at the
								// boundary and snap it to a standard rate where one matches.
								...(fps !== undefined && { fps: floatToFrameRate(fps) }),
								...(canvasSize !== undefined && {
									canvasSize,
									canvasSizeMode: "custom" as const,
								}),
							},
						});
					}
					await editor.project.saveCurrentProject();
					return { id: project.metadata.id };
				},
			}),

		save: () =>
			guard({
				needsEditor: true,
				run: async () => {
					await EditorCore.getInstance().project.saveCurrentProject();
					return { saved: true };
				},
			}),
	};
}

export type AgentApi = ReturnType<typeof createAgentApi>;
