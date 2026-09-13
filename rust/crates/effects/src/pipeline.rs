use std::collections::HashMap;

use bytemuck::{Pod, Zeroable};
use gpu::{FULLSCREEN_SHADER_SOURCE, GpuContext};
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::{EffectPass, UniformValue};

const GAUSSIAN_BLUR_SHADER_ID: &str = "gaussian-blur";
const GAUSSIAN_BLUR_SHADER_SOURCE: &str = include_str!("shaders/gaussian_blur.wgsl");
const COLOR_GRADING_SHADER_ID: &str = "color-grading";
const COLOR_GRADING_SHADER_SOURCE: &str = include_str!("shaders/color_grading.wgsl");

pub struct ApplyEffectsOptions<'a> {
    pub source: &'a wgpu::Texture,
    pub width: u32,
    pub height: u32,
    pub passes: &'a [EffectPass],
}

pub struct EffectPipeline {
    uniform_bind_group_layout: wgpu::BindGroupLayout,
    pipelines: HashMap<String, wgpu::RenderPipeline>,
}

#[derive(Debug, Error)]
pub enum EffectsError {
    #[error("At least one effect pass is required")]
    MissingEffectPasses,
    #[error("Unknown effect shader '{shader}'")]
    UnknownEffectShader { shader: String },
    #[error("Missing uniform '{uniform}' for shader '{shader}'")]
    MissingUniform { shader: String, uniform: String },
    #[error("Uniform '{uniform}' for shader '{shader}' must be a number")]
    InvalidNumberUniform { shader: String, uniform: String },
    #[error(
        "Uniform '{uniform}' for shader '{shader}' must be a vector of length {expected_length}"
    )]
    InvalidVectorUniform {
        shader: String,
        uniform: String,
        expected_length: usize,
    },
    #[error("Shader '{shader}' does not support uniform '{uniform}'")]
    UnsupportedUniform { shader: String, uniform: String },
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EffectUniformBuffer {
    resolution: [f32; 2],
    direction: [f32; 2],
    scalars: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ColorGradingUniformBuffer {
    resolution: [f32; 2],
    _padding: [f32; 2],
    /// brightness, contrast, saturation, temperature
    params_a: [f32; 4],
    /// tint, highlights, shadows, vignette
    params_b: [f32; 4],
}

impl EffectPipeline {
    pub fn new(context: &GpuContext) -> Self {
        let uniform_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-uniform-bind-group-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                });
        let vertex_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-fullscreen-shader"),
                    source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
                });
        let gaussian_blur_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-gaussian-blur-shader"),
                    source: wgpu::ShaderSource::Wgsl(GAUSSIAN_BLUR_SHADER_SOURCE.into()),
                });
        let color_grading_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-color-grading-shader"),
                    source: wgpu::ShaderSource::Wgsl(COLOR_GRADING_SHADER_SOURCE.into()),
                });
        let pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                    ],
                    immediate_size: 0,
                });
        let gaussian_blur_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-gaussian-blur-pipeline"),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &gaussian_blur_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let color_grading_pipeline =
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("effects-color-grading-pipeline"),
                    layout: Some(&pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &color_grading_shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
        let pipelines = HashMap::from([
            (GAUSSIAN_BLUR_SHADER_ID.to_string(), gaussian_blur_pipeline),
            (COLOR_GRADING_SHADER_ID.to_string(), color_grading_pipeline),
        ]);

        Self {
            uniform_bind_group_layout,
            pipelines,
        }
    }

    pub fn apply(
        &self,
        context: &GpuContext,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("effects-command-encoder"),
                });
        let output = self.apply_with_encoder(
            context,
            &mut encoder,
            ApplyEffectsOptions {
                source,
                width,
                height,
                passes,
            },
        )?;
        context.queue().submit([encoder.finish()]);
        Ok(output)
    }

    pub fn apply_with_encoder(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut current_texture: Option<wgpu::Texture> = None;

        for pass in passes {
            let input_texture = current_texture.as_ref().unwrap_or(source);
            let output_texture =
                context.create_render_texture(width, height, "effects-pass-output");
            let input_view = input_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let texture_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-texture-bind-group"),
                        layout: context.texture_sampler_bind_group_layout(),
                        entries: &[
                            wgpu::BindGroupEntry {
                                binding: 0,
                                resource: wgpu::BindingResource::TextureView(&input_view),
                            },
                            wgpu::BindGroupEntry {
                                binding: 1,
                                resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                            },
                        ],
                    });
            let uniform_bytes: Vec<u8> = match pass.shader.as_str() {
                GAUSSIAN_BLUR_SHADER_ID => {
                    bytemuck::bytes_of(&pack_gaussian_blur_uniforms(pass, width, height)?).to_vec()
                }
                COLOR_GRADING_SHADER_ID => {
                    bytemuck::bytes_of(&pack_color_grading_uniforms(pass, width, height)?).to_vec()
                }
                other => {
                    return Err(EffectsError::UnknownEffectShader {
                        shader: other.to_string(),
                    });
                }
            };
            let uniform_buffer =
                context
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("effects-uniform-buffer"),
                        contents: &uniform_bytes,
                        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    });
            let uniform_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-uniform-bind-group"),
                        layout: &self.uniform_bind_group_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: uniform_buffer.as_entire_binding(),
                        }],
                    });
            let pipeline = self.pipelines.get(&pass.shader).ok_or_else(|| {
                EffectsError::UnknownEffectShader {
                    shader: pass.shader.clone(),
                }
            })?;

            {
                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("effects-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &output_view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                    multiview_mask: None,
                });
                render_pass.set_pipeline(pipeline);
                render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
                render_pass.set_bind_group(0, &texture_bind_group, &[]);
                render_pass.set_bind_group(1, &uniform_bind_group, &[]);
                render_pass.draw(0..6, 0..1);
            }

            current_texture = Some(output_texture);
        }

        current_texture.ok_or(EffectsError::MissingEffectPasses)
    }
}

fn pack_gaussian_blur_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let shader = pass.shader.as_str();
    let sigma = read_number_uniform(pass, "u_sigma")?;
    let step = read_number_uniform(pass, "u_step")?;
    let direction = read_vec2_uniform(pass, "u_direction")?;

    for uniform in pass.uniforms.keys() {
        if uniform == "u_sigma" || uniform == "u_step" || uniform == "u_direction" {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction,
        scalars: [sigma, step, 0.0, 0.0],
    })
}

const COLOR_GRADING_UNIFORM_KEYS: [&str; 8] = [
    "u_brightness",
    "u_contrast",
    "u_saturation",
    "u_temperature",
    "u_tint",
    "u_highlights",
    "u_shadows",
    "u_vignette",
];

fn pack_color_grading_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<ColorGradingUniformBuffer, EffectsError> {
    let shader = pass.shader.as_str();

    for uniform in pass.uniforms.keys() {
        if !COLOR_GRADING_UNIFORM_KEYS.contains(&uniform.as_str()) {
            return Err(EffectsError::UnsupportedUniform {
                shader: shader.to_string(),
                uniform: uniform.clone(),
            });
        }
    }

    let mut values = [0.0f32; 8];
    for (index, key) in COLOR_GRADING_UNIFORM_KEYS.iter().enumerate() {
        values[index] = read_number_uniform(pass, key)?;
    }

    Ok(ColorGradingUniformBuffer {
        resolution: [width as f32, height as f32],
        _padding: [0.0, 0.0],
        params_a: [values[0], values[1], values[2], values[3]],
        params_b: [values[4], values[5], values[6], values[7]],
    })
}

fn read_number_uniform(pass: &EffectPass, uniform: &str) -> Result<f32, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Number(value) => Ok(*value),
        UniformValue::Vector(_) => Err(EffectsError::InvalidNumberUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        }),
    }
}

fn read_vec2_uniform(pass: &EffectPass, uniform: &str) -> Result<[f32; 2], EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    let UniformValue::Vector(values) = value else {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    };
    if values.len() != 2 {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    }
    Ok([values[0], values[1]])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn number_uniforms(pairs: &[(&str, f32)]) -> HashMap<String, UniformValue> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), UniformValue::Number(*value)))
            .collect()
    }

    #[test]
    fn packs_all_color_grading_params_in_declared_order() {
        let pass = EffectPass {
            shader: COLOR_GRADING_SHADER_ID.to_string(),
            uniforms: number_uniforms(&[
                ("u_brightness", 0.1),
                ("u_contrast", 0.2),
                ("u_saturation", 0.3),
                ("u_temperature", 0.4),
                ("u_tint", 0.5),
                ("u_highlights", 0.6),
                ("u_shadows", 0.7),
                ("u_vignette", 0.8),
            ]),
        };

        let packed = pack_color_grading_uniforms(&pass, 1920, 1080).unwrap();

        assert_eq!(packed.resolution, [1920.0, 1080.0]);
        assert_eq!(packed.params_a, [0.1, 0.2, 0.3, 0.4]);
        assert_eq!(packed.params_b, [0.5, 0.6, 0.7, 0.8]);
    }

    #[test]
    fn errors_on_missing_color_grading_uniform() {
        let pass = EffectPass {
            shader: COLOR_GRADING_SHADER_ID.to_string(),
            uniforms: number_uniforms(&[
                ("u_brightness", 0.1),
                ("u_saturation", 0.3),
                ("u_temperature", 0.4),
                ("u_tint", 0.5),
                ("u_highlights", 0.6),
                ("u_shadows", 0.7),
                ("u_vignette", 0.8),
            ]),
        };

        let result = pack_color_grading_uniforms(&pass, 1920, 1080);

        assert!(matches!(
            result,
            Err(EffectsError::MissingUniform { uniform, .. }) if uniform == "u_contrast"
        ));
    }

    #[test]
    fn errors_on_unsupported_color_grading_uniform() {
        let mut map = number_uniforms(&[
            ("u_brightness", 0.1),
            ("u_contrast", 0.2),
            ("u_saturation", 0.3),
            ("u_temperature", 0.4),
            ("u_tint", 0.5),
            ("u_highlights", 0.6),
            ("u_shadows", 0.7),
            ("u_vignette", 0.8),
        ]);
        map.insert("u_sigma".to_string(), UniformValue::Number(1.0));
        let pass = EffectPass {
            shader: COLOR_GRADING_SHADER_ID.to_string(),
            uniforms: map,
        };

        let result = pack_color_grading_uniforms(&pass, 1920, 1080);

        assert!(matches!(
            result,
            Err(EffectsError::UnsupportedUniform { uniform, .. }) if uniform == "u_sigma"
        ));
    }

    #[test]
    fn color_grading_shader_source_is_valid_wgsl() {
        naga::front::wgsl::parse_str(COLOR_GRADING_SHADER_SOURCE)
            .expect("color_grading.wgsl should parse as valid WGSL");
    }
}
