/**
 * Barrel for the agent facade. Everything re-exported here must be safe to pull
 * into a server component's module graph — `./api` is not, so it is reachable
 * only as a type and through the lazy import inside `./bridge`.
 */
export { AgentBridge } from "./bridge";
export { setAgentEditorReady } from "./ready";
export { AGENT_API_VERSION } from "./version";
export type { AgentApi } from "./api";

export const AGENT_API_ENABLED =
	process.env.NEXT_PUBLIC_OPENCUT_AGENT_API === "1";
