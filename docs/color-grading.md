# Color Grading

Color grading is a built-in GPU effect (brightness, contrast, saturation, temperature, tint, highlights, shadows, vignette) exposed through the **Adjustment** tab in the assets panel — select a clip, flip a switch, and eight sliders appear, styled after CapCut's "Adjust" panel rather than the general drag-an-effect-onto-a-clip flow the rest of the Effects system uses.

This doc covers the feature end-to-end. For the general "how do effects work" primer (GPU pipeline, pass resolution, shader registration), read [`effects-renderer.md`](./effects-renderer.md) first — this doc assumes it.

---

## How It Works

Three layers, same as any other effect, plus one UI layer that's specific to this feature.

### 1. The effect definition — `apps/web/src/effects/definitions/color-grading.ts`

A standard `EffectDefinition`, registered in `apps/web/src/effects/definitions/index.ts` next to `blurEffectDefinition`. Eight `NumberParamDefinition`s, all `-100..100` except `vignette` (`0..100`). `buildColorGradingUniforms` normalizes every param the same way — divide by 100 — so `brightness: 50` becomes `u_brightness: 0.5` and `vignette: 100` becomes `u_vignette: 1`. It's a single-pass effect (see `effects-renderer.md`'s single-pass vs multi-pass section): one `{ shader: "color-grading", uniforms: ... }` entry, no `buildPasses`.

### 2. The GPU shader — Rust + WGSL

- `rust/crates/effects/src/shaders/color_grading.wgsl` — the fragment shader. Applies, in order: brightness (additive), contrast (scale around 0.5), temperature/tint (push R/B and G channels), saturation (mix toward luminance), highlights/shadows (luma-masked lift via `smoothstep`), vignette (radial darken, aspect-corrected using `uniforms.resolution`).
- `rust/crates/effects/src/pipeline.rs` — `ColorGradingUniformBuffer` (the Rust-side mirror of the shader's `EffectUniforms` struct), `pack_color_grading_uniforms` (validates and packs the 8 named uniforms), and a `color_grading_pipeline` registered in `EffectPipeline::new` alongside blur's.

Read [`effects-renderer.md`'s "Per-shader uniform buffers" section](./effects-renderer.md#per-shader-uniform-buffers) for why this effect needed its own uniform struct and packer rather than reusing blur's — short version: the two effects don't share a uniform shape, and WGSL's `array<f32,N>` alignment rules mean you can't just widen the existing one without breaking it.

### 3. The Adjustment tab — `apps/web/src/adjustment/components/assets-view.tsx`

This is the part that's specific to color grading, not a generic effects-system feature. It replaces what was a `"Adjustment view coming soon..."` placeholder in `apps/web/src/components/editor/panels/assets/index.tsx`.

Unlike the **Effects** tab (`apps/web/src/effects/components/assets-view.tsx`), which shows a grid of effects you drag onto a clip, the Adjustment tab is **selection-driven**: it reads the currently selected timeline element (`useElementSelection`) and shows controls for *that* clip directly, no drag step.

- No selection, or more than one element selected → an empty state (`"Select a clip..."`).
- A non-visual element selected (e.g. text, audio) → a different empty state (`"Color grading works on video, image, sticker, and graphic clips."`) — gated by `isVisualElement`, the same guard `EFFECT_TARGET_ELEMENT_TYPES` uses.
- A visual element selected → the **Enable Color Grading** switch. Toggling it doesn't just show/hide UI — it adds or removes an actual `color-grading` effect on the clip via `editor.timeline.addClipEffect` / `removeClipEffect`, the same commands the Effects tab's clip effects list uses. The switch's checked state is read from whether the clip's committed `effects` array already contains a `color-grading` entry, not from local component state — so the tab stays in sync if the effect is removed some other way (e.g. from the clip's own Effects tab in Properties).
- Once enabled, the 8 sliders render via the same `PropertyParamField` + `useElementPreview` preview/commit pattern the Effects tab's `ClipEffectsTab` uses (drag a slider → live preview via `previewUpdates`; release → `commit()`). Nothing about slider dragging is color-grading-specific; it's the standard param-editing pattern reused.

A clip can have a `color-grading` effect whether it was added through this tab or dragged in from the Effects tab grid — it's the same effect type either way, just two different entry points into the same `element.effects` array.

---

## Extending Color Grading — adding a new parameter

Worked example: adding a 9th param, `sharpen` (`0..100`).

1. **`color-grading.ts`**: add `"sharpen"` to `PARAM_KEYS`, add its `NumberParamDefinition` to `colorGradingEffectDefinition.params`. `buildColorGradingUniforms` needs no change — it already loops over `PARAM_KEYS` generically. Add a case to `color-grading.test.ts` covering the new param's normalization.
2. **`pipeline.rs`**: this is the part that doesn't generalize automatically — `ColorGradingUniformBuffer` is a fixed-size `Pod` struct sized for exactly 8 params (two `vec4f`-shaped groups). A 9th param needs a 3rd group (`params_c: [f32; 4]`, padded), or repurpose a currently-unused padding slot if one exists. Update `COLOR_GRADING_UNIFORM_KEYS`, the struct, and `pack_color_grading_uniforms`'s field assignment. Update the three `pipeline::tests` (packing, missing-uniform, unsupported-uniform) to cover 9 keys instead of 8.
3. **`color_grading.wgsl`**: add `params_c: vec4f` to the `EffectUniforms` struct (matching the Rust struct's new layout exactly), read `uniforms.params_c.x` for the new param, apply the math.
4. **Rebuild and test**: `cargo test -p effects` (from `rust/`) for the Rust/WGSL tests, `bun test apps/web/src/effects` for the TS tests, then rebuild WASM (see below) and smoke-test in the browser — a shader math bug won't show up in any of the automated tests, only in the rendered frame.

The same steps apply to changing an existing param's math (e.g. retuning vignette's falloff curve) — only step 3 is needed, since the uniform shape doesn't change.

---

## Testing

- **Rust**: `cd rust && cargo test -p effects` — covers uniform packing (happy path, missing uniform, unsupported uniform) and WGSL syntax validity (`naga::front::wgsl::parse_str`) for the color-grading shader.
- **TypeScript**: `bun test apps/web/src/effects` — covers `buildColorGradingUniforms`'s param-to-uniform normalization.
- **Neither test suite touches the GPU.** They catch wiring bugs (wrong uniform name, malformed WGSL, wrong normalization math) but not "does this actually look right" — a shader that parses and packs correctly can still produce a visually wrong result (wrong sign, wrong blend order, clipped range). Always confirm in the browser after a shader change: select a clip with the effect enabled, push a param to an extreme value, and check the preview visibly does the expected thing (e.g. `saturation: -100` should render fully grayscale; `vignette: 100` should darken the frame edges).

---

## Local dev: rebuilding the WASM package

Any change under `rust/` — including `pipeline.rs`, `color_grading.wgsl`, or a new effect's shader — is invisible in the running app until the WASM package is rebuilt, because `apps/web` normally depends on the **published** `opencut-wasm` npm package (`^0.2.10`), not a local build.

1. Install `wasm-pack` once: `cargo install wasm-pack` (needs `cargo`/`rustc`, already required for this repo).
2. Build: `bun run build:wasm` from the repo root (runs `wasm-pack build rust/wasm --target bundler --out-dir pkg`), or `bun run dev:wasm` to rebuild automatically on file changes (`cargo watch` under the hood).
3. **Point the app at your local build instead of the npm package.** Bun resolves `opencut-wasm` through a symlink at `node_modules/opencut-wasm` (and a second one at `apps/web/node_modules/opencut-wasm`) into its package store; both ultimately point at the same directory. For local iteration, repoint both symlinks directly at your build output:
   ```bash
   ln -sfn "$(pwd)/rust/wasm/pkg" node_modules/opencut-wasm
   ln -sfn "$(pwd)/rust/wasm/pkg" apps/web/node_modules/opencut-wasm
   ```
4. Restart the Next.js dev server (a running server won't pick up a swapped WASM binary or a symlink change on its own — it needs a fresh process, and a fresh `.next` cache if you see stale-module errors).
5. When you're done, a plain `bun install` restores the symlinks back to the published package — the swap above never touches anything tracked by git.

`publish:wasm` (`bun run build:wasm && npm publish rust/wasm/pkg --access public`) is how a Rust/WASM change actually ships to everyone else, once merged — bumping `rust/wasm/Cargo.toml`'s version and `apps/web/package.json`'s `opencut-wasm` dependency is a separate, deliberate step, not part of routine local development.

---

## Checklist

- [ ] Param added to `colorGradingEffectDefinition.params` in `color-grading.ts` (TS)
- [ ] `color-grading.test.ts` covers the new param's uniform normalization
- [ ] `ColorGradingUniformBuffer` / `COLOR_GRADING_UNIFORM_KEYS` / `pack_color_grading_uniforms` updated in `pipeline.rs` (Rust)
- [ ] `pipeline::tests` updated for the new uniform count
- [ ] `EffectUniforms` struct and math updated in `color_grading.wgsl`, matching the Rust struct's layout field-for-field
- [ ] `cargo test -p effects` and `bun test apps/web/src/effects` both pass
- [ ] WASM rebuilt locally and the change verified visually in the browser, not just via tests
