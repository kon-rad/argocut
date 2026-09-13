# Effects & GPU Renderer

## How to add a new effect

1. Create a new file in `apps/web/src/effects/definitions/` (e.g. `brightness.ts`)
2. Export an `EffectDefinition` — see `blur.ts` or `color-grading.ts` as a reference
3. Register it in `apps/web/src/effects/definitions/index.ts`
4. If the effect needs new GPU math (most will), follow [Writing shaders](#writing-shaders) and [Per-shader uniform buffers](#per-shader-uniform-buffers) below — a new effect definition alone has nothing to render until its shader and Rust-side uniform packer exist too.

An effect definition has:
- `type` — unique string identifier
- `name` — display name
- `keywords` — for search
- `params` — user-facing controls (sliders, toggles, etc.)
- `renderer` — GPU pass templates resolved into shader identifiers + uniforms

All effects use the shared GPU renderer. TypeScript decides which shader identifiers to run and which uniforms to pass. Rust/wgpu owns device creation, textures, and pass execution.

## Single-pass vs multi-pass

The renderer supports a `passes` array. Single-pass effects (e.g. color grading) just have one entry. Multi-pass is needed when an effect has to process its own output — blur (H then V), bloom (extract → blur → composite), glow, etc.

```typescript
renderer: {
  passes: [
    { shader: "my-effect-shader", uniforms: ({ effectParams }) => ({ ... }) },
  ],
}
```

### Dynamic pass counts with `buildPasses`

Some effects need a variable number of passes depending on their parameters (e.g. blur needs more iterations at high intensity to keep quality). For these, add a `buildPasses` function to the renderer:

```typescript
renderer: {
  passes: [ /* static fallback — used if buildPasses is absent */ ],
  buildPasses: ({ effectParams, width, height }) => {
    // return EffectPass[] with pre-computed uniforms
  },
}
```

When `buildPasses` is present, all rendering paths use it instead of the static `passes` array. The static array is kept as a structural reference and fallback for effects that don't need dynamic pass counts.

### Resolving passes — always use `resolveEffectPasses`

All code that consumes effect passes should go through the helper, never access `definition.renderer.passes` directly:

```typescript
import { resolveEffectPasses } from "@/effects";

const passes = resolveEffectPasses({ definition, effectParams, width, height });
```

This handles the `buildPasses` vs static `passes` dispatch automatically.

### Pipeline

Linear effect chains go through `gpuRenderer.applyEffect()` in `apps/web/src/services/renderer/gpu-renderer.ts`.

TypeScript resolves `EffectPass[]` from effect definitions. Each pass contains:
- `shader` — a stable identifier such as `"gaussian-blur"` or `"color-grading"`
- `uniforms` — resolved numeric values for that pass, keyed by name (e.g. `u_sigma`, `u_brightness`)

Rust owns everything from here: `rust/crates/effects/src/pipeline.rs` (`EffectPipeline`) holds one `wgpu::RenderPipeline` per shader identifier in a `HashMap`, built once in `EffectPipeline::new`. `apply_with_encoder` loops over the passes, and for each one matches `pass.shader.as_str()` to pick both the right render pipeline and the right uniform packer (see below) — there is no generic "one struct fits all shaders" path; each shader gets its own. Non-linear GPU work such as signed-distance-field generation and mask feathering lives in the `masks` crate's own pipeline modules, following the same shape.

## Writing shaders

Two crates hold WGSL:
- `rust/crates/gpu/src/shaders/` — shared shaders used by every effect: `fullscreen.wgsl` (the vertex shader, outputs `VertexOutput { position, tex_coord }`) and `blit.wgsl`.
- `rust/crates/effects/src/shaders/` — one fragment shader per effect (`gaussian_blur.wgsl`, `color_grading.wgsl`, …).

To add a shader: create the `.wgsl` file in `rust/crates/effects/src/shaders/`, `include_str!` it as a `const ..._SHADER_SOURCE` in `pipeline.rs`, and register a render pipeline for it in `EffectPipeline::new` (copy the `color_grading_pipeline` block — same `pipeline_layout`, same `fullscreen.wgsl` vertex stage, just your shader module in the fragment stage). Add its `(SHADER_ID, pipeline)` pair to the `pipelines` `HashMap::from([...])`.

Every effect fragment shader binds the same two groups:
- `@group(0) @binding(0) input_texture: texture_2d<f32>` and `@binding(1) input_sampler: sampler` — the source frame, wired automatically by `apply_with_encoder`.
- `@group(1) @binding(0) var<uniform> uniforms: EffectUniforms` — **your** per-shader uniform struct. There is no shared/injected uniform name like `u_texture` or `u_resolution` — the input texture is a plain bind-group resource, and resolution (when a shader needs it) is just a field you put in your own `EffectUniforms` struct, as `color_grading.wgsl` does.

Any uniform your `uniforms()` pass-template function returns must have a matching field in your shader's `EffectUniforms` struct **and** in its Rust-side packer (next section) — the three have to agree by hand, nothing derives one from another.

**Sampling density and step scaling**

A fixed kernel (e.g. ±30 samples) can only cover ±30 texels at step=1. When the target sigma grows beyond ~10, the kernel can't cover enough of the Gaussian curve and the result degrades into a box filter.

The fix is a `u_step` uniform that spaces samples further apart. With step=4 the same 61-sample kernel covers ±120 texels. Bilinear texture filtering smooths the gaps between samples. For very large sigma, combine step scaling with **multi-iteration stacking** (multiple H+V pass pairs via `buildPasses`) — each iteration compounds the blur, and the effective sigma = per-pass sigma × √iterations.

Keep the step size moderate (≤4) to avoid visible banding. If you need more blur than step=4 allows in a single iteration, add iterations instead of increasing the step further.

```wgsl
// u_step scales the distance between samples
let position = f32(sample_index) * uniforms.step;
let weight = exp(-(position * position) / (2.0 * uniforms.sigma * uniforms.sigma));
color += textureSample(input_texture, input_sampler, uv + texel_size * uniforms.direction * position) * weight;
```

Do **not** use large step sizes (>6) in a single pass — it creates visible banding regardless of bilinear interpolation. Use multiple iterations instead.

## Per-shader uniform buffers

Each shader packs its own `#[repr(C)] #[derive(Clone, Copy, Pod, Zeroable)]` struct in `pipeline.rs` — there is deliberately no single shared uniform layout. `EffectUniformBuffer` (blur: resolution, direction, 4 scalars) and `ColorGradingUniformBuffer` (color grading: resolution, padding, 2× 4-param groups) are siblings, not variants of one type.

**WGSL alignment gotcha:** a raw `array<f32, N>` inside a `var<uniform>` struct pads every element to 16 bytes (the uniform-address-space array stride rule) — so packing 4 scalars as `array<f32, 4>` costs 64 bytes, not 16, and silently desyncs from a tightly-packed Rust `[f32; 4]`. Always group scalars into `vec4f` in WGSL (`color_grading.wgsl`'s `params_a: vec4f` / `params_b: vec4f`) to match a plain `[f32; 4]` field on the Rust side byte-for-byte.

To add a new effect's uniforms:

1. Add the struct next to the others (see `ColorGradingUniformBuffer`).
2. Add a `pack_<effect>_uniforms(pass, width, height) -> Result<YourStruct, EffectsError>` function. Follow `pack_color_grading_uniforms`'s shape if your effect has more than 2-3 named scalars: declare a `const YOUR_EFFECT_UNIFORM_KEYS: [&str; N]`, reject any uniform key not in that list (`EffectsError::UnsupportedUniform`), then read each with `read_number_uniform` (`EffectsError::MissingUniform` if absent). Use `pack_gaussian_blur_uniforms`'s shape instead if your effect has a handful of named fields with different meanings (a `read_vec2_uniform`-style direction, etc.) rather than a flat list.
3. Add your shader's ID to the `match pass.shader.as_str()` block in `apply_with_encoder` (the `uniform_bytes` match) so it calls your packer.
4. Write Rust unit tests for the packer (packs correctly, missing uniform errors, unsupported uniform errors) — see the `pipeline::tests` module for the color-grading examples to copy.
5. Add a `naga::front::wgsl::parse_str(YOUR_SHADER_SOURCE).expect(...)` test alongside them. `naga` (the crate `wgpu` itself uses to validate WGSL) is a `[dev-dependencies]` entry in `rust/crates/effects/Cargo.toml` for exactly this — it catches shader syntax errors in `cargo test`, before you ever load the page.

## Coordinate systems

Source canvases are imported through `copy_external_image_to_texture()`, which is the boundary where browser canvas data enters the GPU pipeline. If a shader or import path changes, validate orientation explicitly — the renderer assumes a consistent top-left canvas origin by the time results come back to TypeScript.
