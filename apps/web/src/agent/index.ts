export { AgentBridge } from "./bridge";
export { setAgentEditorReady } from "./ready";
export { AGENT_API_VERSION, type AgentApi } from "./api";

export const AGENT_API_ENABLED =
	process.env.NEXT_PUBLIC_OPENCUT_AGENT_API === "1";
