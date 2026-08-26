#!/usr/bin/env bun
/**
 * Drive the ArgoCut MCP server over stdio from a JSON script.
 *
 * Each entry in the script is `{ "tool": "<name>", "args": { ... } }`, executed
 * in order. Results print as they arrive; a tool error stops the run, because
 * every later call would be building on state that does not exist.
 *
 * Usage:
 *   mcp_call.mjs plan.json
 *   echo '[{"tool":"get_timeline","args":{}}]' | mcp_call.mjs -
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, "..", "..", "..", "packages", "mcp-server", "src", "index.ts");

const source = process.argv[2];
if (!source) {
	console.error("usage: mcp_call.mjs <script.json|->");
	process.exit(2);
}
const outFlag = process.argv.indexOf("--out");
const outDir = outFlag > 0 ? process.argv[outFlag + 1] : null;
if (outDir) mkdirSync(outDir, { recursive: true });

const steps = JSON.parse(
	source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8"),
);

const child = spawn("bun", ["run", serverEntry], {
	stdio: ["pipe", "pipe", "inherit"],
	env: process.env,
});

let buffer = "";
const pending = new Map();

child.stdout.on("data", (chunk) => {
	buffer += chunk.toString();
	let index;
	while ((index = buffer.indexOf("\n")) >= 0) {
		const line = buffer.slice(0, index).trim();
		buffer = buffer.slice(index + 1);
		if (!line) continue;
		let message;
		try {
			message = JSON.parse(line);
		} catch {
			continue;
		}
		const resolve = pending.get(message.id);
		if (resolve) {
			pending.delete(message.id);
			resolve(message);
		}
	}
});

let nextId = 1;
function send({ method, params }) {
	const id = nextId++;
	return new Promise((resolve) => {
		pending.set(id, resolve);
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
	});
}

function notify({ method, params }) {
	child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

await send({
	method: "initialize",
	params: {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "argocut-driver", version: "1" },
	},
});
notify({ method: "notifications/initialized" });

let failed = false;
for (const [index, step] of steps.entries()) {
	process.stdout.write(`\n[${index + 1}/${steps.length}] ${step.tool}\n`);
	const response = await send({
		method: "tools/call",
		params: { name: step.tool, arguments: step.args ?? {} },
	});

	const result = response.result;
	const text = result?.content?.map((c) => c.text).join("\n") ?? JSON.stringify(response);

	if (result?.isError) {
		console.error(`  ERROR: ${text}`);
		failed = true;
		break;
	}
	if (outDir) {
		const file = join(outDir, `${String(index + 1).padStart(2, "0")}-${step.tool}.json`);
		writeFileSync(file, text);
		console.log(`  -> ${file} (${text.length} bytes)`);
	} else {
		// Truncating structured output produces invalid JSON downstream, so say so
		// loudly rather than printing a broken fragment.
		console.log(
			text.length > 4000
				? `${text.slice(0, 4000)}\n  ...TRUNCATED — rerun with --out <dir> for the full result`
				: text,
		);
	}
}

child.stdin.end();
child.kill();
process.exit(failed ? 1 : 0);
