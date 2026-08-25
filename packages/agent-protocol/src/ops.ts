import { z } from "zod";

export const elementTargetSchema = z.union([
	z.object({ elementId: z.string().min(1) }),
	z.object({ name: z.string().min(1) }),
	z.object({ track: z.string().min(1), index: z.number().int().min(0) }),
	z.object({ ref: z.number().int().min(0) }),
]);

export type ElementTarget = z.infer<typeof elementTargetSchema>;

const seconds = z.number().finite().min(0);
const paramValue = z.union([z.string(), z.number(), z.boolean()]);

export const editOpSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("add_clip"),
		mediaId: z.string().min(1),
		track: z.string().min(1).default("main"),
		startTime: seconds.optional(),
		trimStart: seconds.optional(),
		trimEnd: seconds.optional(),
		name: z.string().optional(),
	}),
	z.object({
		op: z.literal("add_text"),
		text: z.string(),
		startTime: seconds,
		duration: z.number().finite().positive(),
		track: z.string().min(1).optional(),
		params: z.record(z.string(), paramValue).optional(),
	}),
	z.object({
		op: z.literal("split"),
		target: elementTargetSchema,
		atTime: seconds,
		retain: z.enum(["both", "left", "right"]).default("both"),
	}),
	z.object({
		op: z.literal("trim"),
		target: elementTargetSchema,
		trimStart: seconds.optional(),
		trimEnd: seconds.optional(),
	}),
	z.object({
		op: z.literal("retime"),
		target: elementTargetSchema,
		rate: z.number().finite().gt(0).lte(100),
		maintainPitch: z.boolean().optional(),
	}),
	z.object({
		op: z.literal("move"),
		target: elementTargetSchema,
		startTime: seconds,
		track: z.string().min(1).optional(),
	}),
	z.object({ op: z.literal("delete"), target: elementTargetSchema }),
	z.object({
		op: z.literal("duplicate"),
		target: elementTargetSchema,
		startTime: seconds.optional(),
	}),
	z.object({
		op: z.literal("set_params"),
		target: elementTargetSchema,
		params: z.record(z.string(), paramValue),
	}),
	z.object({
		op: z.literal("add_keyframe"),
		target: elementTargetSchema,
		param: z.string().min(1),
		time: seconds,
		value: paramValue,
		interpolation: z.enum(["linear", "hold", "ease"]).optional(),
	}),
	z.object({
		op: z.literal("add_effect"),
		target: elementTargetSchema,
		effectType: z.string().min(1),
	}),
	z.object({
		op: z.literal("add_mask"),
		target: elementTargetSchema,
		maskType: z.string().min(1),
	}),
	z.object({
		op: z.literal("add_track"),
		type: z.enum(["video", "text", "audio", "graphic", "effect"]),
		name: z.string().optional(),
	}),
]);

export type EditOp = z.infer<typeof editOpSchema>;
export type EditOpKind = EditOp["op"];

export const applyEditsInputSchema = z.object({
	ops: z.array(editOpSchema).min(1).max(500),
	label: z.string().optional(),
});

export type ApplyEditsInput = z.infer<typeof applyEditsInputSchema>;
