import { describe, expect, test } from "bun:test";
import { loadConfig } from "../config";

describe("loadConfig", () => {
	test("defaults to localhost:3000", () => {
		expect(loadConfig({ env: {} }).baseUrl).toBe("http://localhost:3000");
	});

	test("honours OPENCUT_BASE_URL", () => {
		expect(loadConfig({ env: { OPENCUT_BASE_URL: "http://localhost:3100" } }).baseUrl).toBe(
			"http://localhost:3100",
		);
	});

	test("strips a trailing slash", () => {
		expect(loadConfig({ env: { OPENCUT_BASE_URL: "http://localhost:3000/" } }).baseUrl).toBe(
			"http://localhost:3000",
		);
	});

	test("defaults the data root under the home directory", () => {
		expect(loadConfig({ env: { HOME: "/home/x" } }).profileDir).toBe("/home/x/ArgoCut/profile");
	});

	test("honours ARGOCUT_HOME", () => {
		expect(loadConfig({ env: { ARGOCUT_HOME: "/vol/argocut" } }).profileDir).toBe(
			"/vol/argocut/profile",
		);
	});

	test("still honours the legacy OPENCUT_AGENT_HOME", () => {
		expect(
			loadConfig({ env: { OPENCUT_AGENT_HOME: "/legacy" } }).backupDir,
		).toBe("/legacy/backups");
	});
});
