import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { applyEditsInputSchema } from "@argocut/agent-protocol";
import { z } from "zod";
import type { AgentSession } from "./session";

export const TOOL_NAMES = [
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
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * One funnel for every handler. A thrown error becomes an in-band tool error
 * carrying the message, not a protocol failure — the agent can read it and
 * correct course.
 */
async function respond({
	run,
}: {
	run: () => Promise<unknown>;
}): Promise<CallToolResult> {
	try {
		const value = await run();
		return {
			content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
		};
	} catch (error) {
		return {
			content: [
				{
					type: "text",
					text: error instanceof Error ? error.message : String(error),
				},
			],
			isError: true,
		};
	}
}

export function registerTools({
	server,
	session,
}: {
	server: McpServer;
	session: AgentSession;
}): void {
	server.registerTool(
		"list_projects",
		{
			title: "List projects",
			description:
				"List every ArgoCut project in the agent browser profile: id, name, duration in seconds, and when it was last updated.",
			inputSchema: z.object({}),
		},
		() => respond({ run: () => session.browser.call({ method: "listProjects" }) }),
	);

	server.registerTool(
		"create_project",
		{
			title: "Create project",
			description:
				"Create a new project and make it active. Optionally set its name, frame rate and canvas size. Returns the project id.",
			inputSchema: z.object({
				name: z.string().optional(),
				fps: z.number().finite().gt(0).optional(),
				canvasSize: z
					.object({
						width: z.number().int().positive(),
						height: z.number().int().positive(),
					})
					.optional(),
			}),
		},
		({ name, fps, canvasSize }) =>
			respond({
				run: async () => {
					const projectId = await session.browser.createProject();
					session.setActiveProject({ projectId });

					if (name !== undefined || fps !== undefined || canvasSize !== undefined) {
						await session.browser.call({
							method: "configureProject",
							args: { name, fps, canvasSize },
						});
					}

					return { projectId };
				},
			}),
	);

	server.registerTool(
		"open_project",
		{
			title: "Open project",
			description:
				"Make an existing project active in the agent browser. Every editing tool operates on the active project.",
			inputSchema: z.object({ projectId: z.string().min(1) }),
		},
		({ projectId }) =>
			respond({
				run: async () => {
					const opened = await session.browser.openProject({ projectId });
					session.setActiveProject({ projectId: opened });
					return { projectId: opened };
				},
			}),
	);

	server.registerTool(
		"import_media",
		{
			title: "Import media",
			description:
				"Import local files into the active project through the editor's own upload pipeline. Returns one result per path — a mediaId with probed metadata, or the reason the file was skipped. Never assume a file imported; read the result.",
			inputSchema: z.object({ paths: z.array(z.string().min(1)).min(1) }),
		},
		({ paths }) =>
			respond({
				run: async () => {
					session.requireActiveProject();
					await session.browser.stageFiles({ paths });
					return session.browser.call({ method: "importMedia" });
				},
			}),
	);

	server.registerTool(
		"get_project",
		{
			title: "Get project",
			description:
				"Read the active project's settings, scenes, media assets, duration and storage headroom.",
			inputSchema: z.object({}),
		},
		() =>
			respond({
				run: () => {
					session.requireActiveProject();
					return session.browser.call({ method: "getProject" });
				},
			}),
	);

	server.registerTool(
		"get_timeline",
		{
			title: "Get timeline",
			description:
				"Read the active scene's tracks and elements. 'compact' omits params, effects and masks; 'full' includes them.",
			inputSchema: z.object({
				format: z.enum(["compact", "full"]).default("compact"),
			}),
		},
		({ format }) =>
			respond({
				run: () => {
					session.requireActiveProject();
					return session.browser.call({
						method: "getTimeline",
						args: { format },
					});
				},
			}),
	);

	server.registerTool(
		"find_elements",
		{
			title: "Find elements",
			description:
				"Find timeline elements by type, name substring, the time they cover, or the track they sit on. Returns element references usable as an edit target.",
			inputSchema: z.object({
				type: z.string().optional(),
				nameContains: z.string().optional(),
				atTime: z.number().finite().min(0).optional(),
				track: z.string().optional(),
			}),
		},
		(query) =>
			respond({
				run: () => {
					session.requireActiveProject();
					return session.browser.call({ method: "findElements", args: query });
				},
			}),
	);

	server.registerTool(
		"describe_params",
		{
			title: "Describe params",
			description:
				"List the parameters an element supports — key, type, default, range and whether it can be keyframed. Read this before set_params or add_keyframe rather than guessing key names.",
			inputSchema: z.object({ elementId: z.string().min(1) }),
		},
		({ elementId }) =>
			respond({
				run: () => {
					session.requireActiveProject();
					return session.browser.call({
						method: "describeParams",
						args: { elementId },
					});
				},
			}),
	);

	server.registerTool(
		"apply_edits",
		{
			title: "Apply edits",
			description:
				"Execute an array of edit operations as one atomic batch and one undo step. Every op is validated first; if one is refused the whole batch rolls back and the failing index is reported. Ops may target elements created by earlier ops in the same batch via { ref: <opIndex> }.",
			inputSchema: applyEditsInputSchema,
		},
		(input) =>
			respond({
				run: () => {
					session.requireActiveProject();
					return session.browser.call({ method: "applyEdits", args: input });
				},
			}),
	);

	server.registerTool(
		"hand_off",
		{
			title: "Hand off to a human",
			description:
				"Save the active project, close the headless browser, and open the project in a detached window the human owns. Returns the URL and the profile it belongs to — the project lives in the agent browser profile, so the URL resolves only in that window, not in the human's everyday browser. Rendering and export stay a human action.",
			inputSchema: z.object({}),
		},
		() =>
			respond({
				run: async () => {
					const projectId = session.requireActiveProject();
					return session.browser.handOff({ projectId });
				},
			}),
	);
}
