#!/usr/bin/env bun
/**
 * Reopen the agent's ArgoCut window.
 *
 * Projects live in the agent browser profile, not the human's everyday Chrome,
 * so an editor URL only resolves in a window pointed at that profile. Closing
 * that window loses nothing — this reopens it against the same data.
 *
 * Usage:
 *   open_editor.mjs                 # project list
 *   open_editor.mjs <projectId>     # straight into a project
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Locate the Playwright-managed Chromium without importing playwright — this
 * script runs from the skill directory, which is outside the workspace where
 * that package is installed.
 */
function findChromium() {
	const cache =
		process.env.PLAYWRIGHT_BROWSERS_PATH ??
		join(homedir(), "Library", "Caches", "ms-playwright");
	if (!existsSync(cache)) return null;

	const builds = readdirSync(cache)
		.filter((name) => /^chromium-\d+$/.test(name))
		.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));

	for (const build of builds) {
		for (const arch of ["chrome-mac-arm64", "chrome-mac", "chrome-linux"]) {
			for (const binary of [
				join("Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
				"chrome",
			]) {
				const candidate = join(cache, build, arch, binary);
				if (existsSync(candidate)) return candidate;
			}
		}
	}
	return null;
}

const home = process.env.ARGOCUT_HOME ?? join(homedir(), "ArgoCut");
const profileDir = join(home, "profile");
const baseUrl = (process.env.ARGOCUT_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const projectId = process.argv[2];
const url = projectId ? `${baseUrl}/editor/${projectId}` : `${baseUrl}/projects`;

if (!existsSync(profileDir)) {
	console.error(`No agent profile at ${profileDir} — nothing has been built yet.`);
	process.exit(1);
}

const lockFile = join(home, "session.lock");
if (existsSync(lockFile)) {
	console.error(
		`An agent session holds ${lockFile}. Two windows on one profile corrupt IndexedDB — let it finish, or delete the lock if nothing is running.`,
	);
	process.exit(1);
}

try {
	const response = await fetch(`${baseUrl}/api/health`);
	if (!response.ok) throw new Error(`status ${response.status}`);
} catch {
	console.error(
		`ArgoCut is not serving at ${baseUrl}. Start it with:\n  NEXT_PUBLIC_ARGOCUT_AGENT_API=1 bun dev:web`,
	);
	process.exit(1);
}

const executable = findChromium();
if (!executable) {
	console.error(
		"No Playwright Chromium found. Install it with:\n  bunx playwright install chromium",
	);
	process.exit(1);
}

const child = spawn(
	executable,
	[
		`--user-data-dir=${profileDir}`,
		"--no-first-run",
		"--no-default-browser-check",
		"--enable-unsafe-swiftshader",
		url,
	],
	{ detached: true, stdio: "ignore" },
);
child.unref();

console.log(`opened ${url}\nprofile: ${profileDir}`);
