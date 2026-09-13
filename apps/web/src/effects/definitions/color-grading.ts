import type { EffectDefinition } from "@/effects/types";
import type { ParamValues } from "@/params";

export const COLOR_GRADING_SHADER = "color-grading";

const PARAM_KEYS = [
	"brightness",
	"contrast",
	"saturation",
	"temperature",
	"tint",
	"highlights",
	"shadows",
	"vignette",
] as const;

const UNIFORM_NORMALIZE_DIVISOR = 100;

function parseParam({
	effectParams,
	key,
}: {
	effectParams: ParamValues;
	key: string;
}): number {
	const raw = effectParams[key];
	if (typeof raw === "number") return raw;
	if (raw === undefined) return 0;
	return Number.parseFloat(String(raw));
}

export function buildColorGradingUniforms({
	effectParams,
}: {
	effectParams: ParamValues;
	width: number;
	height: number;
}): Record<string, number> {
	const uniforms: Record<string, number> = {};
	for (const key of PARAM_KEYS) {
		uniforms[`u_${key}`] =
			parseParam({ effectParams, key }) / UNIFORM_NORMALIZE_DIVISOR;
	}
	return uniforms;
}

export const colorGradingEffectDefinition: EffectDefinition = {
	type: "color-grading",
	name: "Color Grading",
	keywords: [
		"color",
		"grading",
		"grade",
		"adjust",
		"adjustment",
		"brightness",
		"contrast",
		"saturation",
		"white balance",
		"vignette",
	],
	params: [
		{
			key: "brightness",
			label: "Brightness",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "contrast",
			label: "Contrast",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "saturation",
			label: "Saturation",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "temperature",
			label: "Temperature",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "tint",
			label: "Tint",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "highlights",
			label: "Highlights",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "shadows",
			label: "Shadows",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "vignette",
			label: "Vignette",
			type: "number",
			default: 0,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		passes: [
			{
				shader: COLOR_GRADING_SHADER,
				uniforms: ({ effectParams, width, height }) =>
					buildColorGradingUniforms({ effectParams, width, height }),
			},
		],
	},
};
