struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    _padding: vec2f,
    params_a: vec4f, // brightness, contrast, saturation, temperature
    params_b: vec4f, // tint, highlights, shadows, vignette
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

const LUMA_WEIGHTS: vec3f = vec3f(0.2126, 0.7152, 0.0722);

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let source = textureSample(input_texture, input_sampler, input.tex_coord);

    let brightness = uniforms.params_a.x;
    let contrast = uniforms.params_a.y;
    let saturation = uniforms.params_a.z;
    let temperature = uniforms.params_a.w;
    let tint = uniforms.params_b.x;
    let highlights = uniforms.params_b.y;
    let shadows = uniforms.params_b.z;
    let vignette = uniforms.params_b.w;

    var color = source.rgb;

    // Brightness: additive lift, scaled so +/-1 stays within a usable range.
    color = color + brightness * 0.5;

    // Contrast: scale around mid-grey.
    color = (color - vec3f(0.5)) * (1.0 + contrast) + vec3f(0.5);

    // Temperature: push red up / blue down for warmth (and the reverse for cool).
    color.r = color.r + temperature * 0.15;
    color.b = color.b - temperature * 0.15;

    // Tint: push magenta up / green down when positive.
    color.g = color.g - tint * 0.15;

    // Saturation: blend the color toward its own luminance.
    let luma = dot(color, LUMA_WEIGHTS);
    color = mix(vec3f(luma), color, 1.0 + saturation);

    // Highlights / shadows: lift limited to their tonal range via a luma mask.
    let tone_luma = dot(color, LUMA_WEIGHTS);
    let highlight_mask = smoothstep(0.5, 1.0, tone_luma);
    let shadow_mask = 1.0 - smoothstep(0.0, 0.5, tone_luma);
    color = color + highlights * highlight_mask * 0.5;
    color = color + shadows * shadow_mask * 0.5;

    // Vignette: darken toward the frame edges, aspect-corrected.
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    var centered = input.tex_coord - vec2f(0.5, 0.5);
    centered.x = centered.x * aspect;
    let dist = length(centered);
    let vignette_factor = 1.0 - smoothstep(0.3, 0.75, dist) * vignette;
    color = color * vignette_factor;

    return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), source.a);
}
