/**
 * Test preload: make `opencut-wasm` importable under `bun test`.
 *
 * The published package is a wasm-pack **bundler** build. Its entry does
 * `import * as wasm from "./opencut_wasm_bg.wasm"` and expects a bundler to have
 * instantiated the module for it. Bun hands back an uninstantiated namespace, so
 * `wasm.__wbindgen_start()` throws and every module that touches `@/wasm` fails
 * to load. Instantiate it here by hand and register the result as the module.
 */
import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bindings = await import("opencut-wasm/opencut_wasm_bg.js");
const bytes = readFileSync(require.resolve("opencut-wasm/opencut_wasm_bg.wasm"));

const { instance } = await WebAssembly.instantiate(bytes, {
	"./opencut_wasm_bg.js": bindings as unknown as WebAssembly.ModuleImports,
});

const exports = instance.exports as Record<string, unknown> & {
	__wbindgen_start?: () => void;
};

bindings.__wbg_set_wasm(exports);
exports.__wbindgen_start?.();

mock.module("opencut-wasm", () => bindings);
