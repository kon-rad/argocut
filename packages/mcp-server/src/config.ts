import { homedir } from "node:os";
import { join } from "node:path";

export interface AgentServerConfig {
	baseUrl: string;
	/**
	 * Everything the agent owns lives under here, on the local disk.
	 *
	 * Projects and media are **not** in Postgres — that database holds only
	 * users, sessions and feedback. ArgoCut is client-side: projects live in the
	 * browser profile's IndexedDB and media in its OPFS. So this directory is
	 * the entire durable state, and `docker compose down` never touches it.
	 */
	home: string;
	profileDir: string;
	/** Exported project snapshots — the only copy that survives a wiped profile. */
	backupDir: string;
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
	const userHome = env.HOME ?? homedir();
	const root =
		env.ARGOCUT_HOME ?? env.OPENCUT_AGENT_HOME ?? join(userHome, "ArgoCut");

	return {
		baseUrl,
		home: root,
		profileDir: join(root, "profile"),
		backupDir: join(root, "backups"),
		lockFile: join(root, "session.lock"),
		headless: env.OPENCUT_AGENT_HEADED !== "1",
		viewport: { width: 1600, height: 1000 },
		navigationTimeoutMs: 60_000,
	};
}
