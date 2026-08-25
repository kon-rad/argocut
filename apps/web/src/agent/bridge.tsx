"use client";

import { useEffect } from "react";
import type { AgentApi } from "./api";

declare global {
	interface Window {
		__opencutAgent?: AgentApi;
	}
}

/**
 * Installs `window.__opencutAgent` when the agent flag is on.
 *
 * `./api` is imported lazily rather than statically: it reaches `EditorCore`,
 * which transitively pulls client-only React hooks. A static import here would
 * drag that whole graph into the root layout — a server component — and break
 * the build for everyone, flag or no flag.
 */
export function AgentBridge() {
	useEffect(() => {
		if (process.env.NEXT_PUBLIC_OPENCUT_AGENT_API !== "1") {
			return;
		}
		if (window.__opencutAgent) {
			return;
		}

		let cancelled = false;
		void import("./api").then(({ createAgentApi }) => {
			if (cancelled || window.__opencutAgent) {
				return;
			}
			window.__opencutAgent = createAgentApi();
			console.info("[opencut-agent] API installed");
		});

		return () => {
			cancelled = true;
		};
	}, []);

	return null;
}
