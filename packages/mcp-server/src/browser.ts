import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { AgentResult } from "@argocut/agent-protocol";
import { loadConfig, type AgentServerConfig } from "./config";

/**
 * An id that cannot exist. The editor treats a missing project as a signal to
 * create "Untitled Project" and redirect to its real id — the same path a human
 * takes from the "new project" button.
 */
const NEW_PROJECT_SEED = "00000000-0000-4000-8000-000000000000";

const FILE_INPUT_ID = "__argocut_agent_file_input";

export class AgentBrowser {
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private readonly config: AgentServerConfig;

	constructor({ config = loadConfig() }: { config?: AgentServerConfig } = {}) {
		this.config = config;
	}

	/** Single-writer discipline: two contexts on one profile corrupt IndexedDB. */
	private acquireLock(): void {
		const { lockFile } = this.config;
		mkdirSync(dirname(lockFile), { recursive: true });

		if (existsSync(lockFile)) {
			const pid = Number(readFileSync(lockFile, "utf8").trim());
			let alive = false;
			try {
				process.kill(pid, 0);
				alive = true;
			} catch {
				alive = false;
			}

			if (alive && pid !== process.pid) {
				throw new Error(
					`Another ArgoCut agent session (pid ${pid}) already owns the browser profile at ${this.config.profileDir}. Close it before starting a new one.`,
				);
			}
			rmSync(lockFile, { force: true });
		}

		writeFileSync(lockFile, String(process.pid), "utf8");
	}

	private async assertDevServer(): Promise<void> {
		try {
			const response = await fetch(`${this.config.baseUrl}/api/health`);
			if (!response.ok) {
				throw new Error(`status ${response.status}`);
			}
		} catch (error) {
			throw new Error(
				`ArgoCut is not reachable at ${this.config.baseUrl}. Start it with "NEXT_PUBLIC_ARGOCUT_AGENT_API=1 bun dev:web" and try again. (${error instanceof Error ? error.message : String(error)})`,
			);
		}
	}

	async ensureStarted({ headless }: { headless?: boolean } = {}): Promise<Page> {
		if (this.page && !this.page.isClosed()) {
			return this.page;
		}

		await this.assertDevServer();
		this.acquireLock();
		mkdirSync(this.config.profileDir, { recursive: true });

		this.context = await chromium.launchPersistentContext(
			this.config.profileDir,
			{
				headless: headless ?? this.config.headless,
				viewport: this.config.viewport,
				args: [
					"--enable-unsafe-swiftshader",
					"--autoplay-policy=no-user-gesture-required",
				],
			},
		);

		this.page = this.context.pages()[0] ?? (await this.context.newPage());
		this.page.setDefaultTimeout(this.config.navigationTimeoutMs);
		// A modal dialog blocks every subsequent CDP command. Nothing is watching.
		this.page.on("dialog", (dialog) => void dialog.dismiss());

		// A fresh context sits on about:blank, where no app code has run and the
		// facade does not exist. Land on the app so `window.__argocutAgent` is
		// installed before any call is attempted.
		await this.page.goto(this.config.baseUrl, { waitUntil: "domcontentloaded" });
		await this.waitForFacade({ page: this.page });

		return this.page;
	}

	/**
	 * Waits for the bridge to install the facade. Distinct from waiting for the
	 * editor to be ready — read-only calls such as `listProjects` need only the
	 * facade, and no project is open on a non-editor page.
	 */
	private async waitForFacade({ page }: { page: Page }): Promise<void> {
		try {
			await page.waitForFunction(
				() =>
					typeof (window as unknown as { __argocutAgent?: unknown })
						.__argocutAgent !== "undefined",
				undefined,
				{ timeout: this.config.navigationTimeoutMs },
			);
		} catch {
			throw new Error(
				`The agent API was never installed at ${this.config.baseUrl}. Start the web app with NEXT_PUBLIC_ARGOCUT_AGENT_API=1 — without that flag the bridge does nothing.`,
			);
		}
	}

	/** Navigates to a project and waits for the agent API to report the editor ready. */
	async openProject({ projectId }: { projectId: string }): Promise<string> {
		const page = await this.ensureStarted();
		await page.goto(`${this.config.baseUrl}/editor/${projectId}`, {
			waitUntil: "domcontentloaded",
		});
		await this.waitForFacade({ page });

		await page.waitForFunction(
			() =>
				(
					window as unknown as {
						__argocutAgent?: { isReady(): boolean };
					}
				).__argocutAgent?.isReady() === true,
			undefined,
			{ timeout: this.config.navigationTimeoutMs },
		);

		const url = new URL(page.url());
		return url.pathname.split("/").pop() ?? projectId;
	}

	async createProject(): Promise<string> {
		return this.openProject({ projectId: NEW_PROJECT_SEED });
	}

	async call<T>({
		method,
		args,
	}: {
		method: string;
		args?: unknown;
	}): Promise<T> {
		const page = await this.ensureStarted();

		const result = (await page.evaluate(
			async ({ method: name, args: payload }) => {
				const api = (
					window as unknown as {
						__argocutAgent?: Record<
							string,
							(input?: unknown) => Promise<unknown>
						>;
					}
				).__argocutAgent;
				if (!api) {
					return {
						ok: false,
						error: {
							code: "editor_not_ready",
							message: "Agent API is not installed on this page",
						},
					};
				}
				const fn = api[name];
				if (typeof fn !== "function") {
					return {
						ok: false,
						error: {
							code: "unsupported",
							message: `Unknown agent method "${name}"`,
						},
					};
				}
				return fn(payload);
			},
			{ method, args },
		)) as AgentResult<T>;

		if (!result.ok) {
			throw new Error(`[${result.error.code}] ${result.error.message}`);
		}

		return result.value;
	}

	async stageFiles({ paths }: { paths: string[] }): Promise<void> {
		const page = await this.ensureStarted();
		await page.evaluate((id) => {
			if (document.getElementById(id)) return;
			const input = document.createElement("input");
			input.id = id;
			input.type = "file";
			input.multiple = true;
			input.style.position = "fixed";
			input.style.left = "-10000px";
			document.body.appendChild(input);
		}, FILE_INPUT_ID);
		await page.setInputFiles(`#${FILE_INPUT_ID}`, paths);
	}

	/**
	 * Save, drop the headless context, and open the same profile in a window the
	 * human owns. All state is on disk in the profile, so the relaunch is lossless.
	 *
	 * The window is spawned **detached**. A Playwright-launched browser is a child
	 * of this process and dies with it, so handing one back that way gives the
	 * human a window that vanishes the moment the MCP server exits. This one
	 * outlives us.
	 *
	 * It is a separate browser from the human's daily Chrome, and necessarily so:
	 * ArgoCut keeps projects in the browser profile, and this is the profile the
	 * agent wrote to. The URL only resolves in this window.
	 */
	async handOff({ projectId }: { projectId: string }): Promise<{
		url: string;
		profileDir: string;
		note: string;
	}> {
		await this.call({ method: "save" });
		await this.close();

		const url = `${this.config.baseUrl}/editor/${projectId}`;
		const child = spawn(
			chromium.executablePath(),
			[
				`--user-data-dir=${this.config.profileDir}`,
				"--no-first-run",
				"--no-default-browser-check",
				"--enable-unsafe-swiftshader",
				url,
			],
			{ detached: true, stdio: "ignore" },
		);
		child.unref();

		return {
			url,
			profileDir: this.config.profileDir,
			note: "Opened in the agent's own browser window. This project lives in that profile, so the URL will look empty in your everyday Chrome.",
		};
	}

	async close(): Promise<void> {
		await this.context?.close();
		this.context = null;
		this.page = null;
		rmSync(this.config.lockFile, { force: true });
	}
}
