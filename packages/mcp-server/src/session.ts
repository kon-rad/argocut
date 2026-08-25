import { AgentBrowser } from "./browser";

/**
 * The browser is stateless about which project is open. Editing tools need that
 * id, and so does `hand_off`, so the session holds it and refuses editing tools
 * before a project has been opened — a clearer failure than a navigation timeout.
 */
export class AgentSession {
	readonly browser: AgentBrowser;
	private projectId: string | null = null;

	constructor({ browser = new AgentBrowser() }: { browser?: AgentBrowser } = {}) {
		this.browser = browser;
	}

	setActiveProject({ projectId }: { projectId: string }): void {
		this.projectId = projectId;
	}

	requireActiveProject(): string {
		if (!this.projectId) {
			throw new Error(
				"No project is open. Call create_project or open_project first.",
			);
		}
		return this.projectId;
	}

	getActiveProject(): string | null {
		return this.projectId;
	}

	async close(): Promise<void> {
		await this.browser.close();
		this.projectId = null;
	}
}
