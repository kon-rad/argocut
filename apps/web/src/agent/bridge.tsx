"use client";

import { useEffect } from "react";
import { createAgentApi, type AgentApi } from "./api";

declare global {
	interface Window {
		__opencutAgent?: AgentApi;
	}
}

export function AgentBridge() {
	useEffect(() => {
		if (process.env.NEXT_PUBLIC_OPENCUT_AGENT_API !== "1") {
			return;
		}
		if (window.__opencutAgent) {
			return;
		}

		window.__opencutAgent = createAgentApi();
		console.info("[opencut-agent] API installed");
	}, []);

	return null;
}
