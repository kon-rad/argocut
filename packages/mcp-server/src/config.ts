import { homedir } from "node:os";
import { join } from "node:path";

export interface AgentServerConfig {
	baseUrl: string;
	profileDir: string;
	lockFile: string;
	headless: boolean;
	viewport: { width: number; height: number };
	navigationTimeoutMs: number;
}

export function loadConfig({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): AgentServerConfig {
	const baseUrl = (env.OPENCUT_BASE_URL ?? "http://localhost:3000").replace(
		/\/+$/,
		"",
	);
	const home = env.HOME ?? homedir();
	const root = env.OPENCUT_AGENT_HOME ?? join(home, ".opencut-agent");

	return {
		baseUrl,
		profileDir: join(root, "profile"),
		lockFile: join(root, "session.lock"),
		headless: env.OPENCUT_AGENT_HEADED !== "1",
		viewport: { width: 1600, height: 1000 },
		navigationTimeoutMs: 60_000,
	};
}
