#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { AgentBrowser } from "./browser";
import { loadConfig } from "./config";
import { AgentSession } from "./session";
import { registerTools } from "./tools";

export { AgentBrowser } from "./browser";
export { loadConfig, type AgentServerConfig } from "./config";
export { AgentSession } from "./session";
export { registerTools, TOOL_NAMES, type ToolName } from "./tools";

export function createServer(): McpServer {
	const server = new McpServer(
		{ name: "argocut", version: "0.1.0" },
		{ capabilities: { tools: {} } },
	);

	// The browser launches lazily on the first tool call, so starting this
	// process never requires the dev server to be up.
	const session = new AgentSession({
		browser: new AgentBrowser({ config: loadConfig() }),
	});

	registerTools({ server, session });
	return server;
}

if (import.meta.main) {
	serveStdio(() => createServer(), {
		onerror: (error) => {
			console.error("[argocut-mcp]", error.message);
		},
	});
}
