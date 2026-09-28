import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const createLabelSchema = z.object({
	name: z.string().trim().min(1).max(30),
	color: z.string().regex(HEX_COLOR),
});

export const updateLabelSchema = z.object({
	name: z.string().trim().min(1).max(30).optional(),
	color: z.string().regex(HEX_COLOR).optional(),
});

export type CreateLabelInput = z.infer<typeof createLabelSchema>;

export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
