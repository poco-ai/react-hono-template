import { z } from "zod";
import { STATUS_CATEGORIES } from "../constants";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const createStatusSchema = z.object({
	name: z.string().trim().min(1).max(30),
	category: z.enum(STATUS_CATEGORIES),
	color: z.string().regex(HEX_COLOR),
});

export const updateStatusSchema = z.object({
	name: z.string().trim().min(1).max(30).optional(),
	category: z.enum(STATUS_CATEGORIES).optional(),
	color: z.string().regex(HEX_COLOR).optional(),
	isDefault: z.boolean().optional(),
});

/** Full ordered list of status ids; the server only accepts a permutation. */
export const reorderStatusesSchema = z.object({
	ids: z.array(z.string().min(1)).min(1).max(50),
});

export const deleteStatusQuerySchema = z.object({
	migrateToStatusId: z.string().min(1).optional(),
});

export type CreateStatusInput = z.infer<typeof createStatusSchema>;

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export type ReorderStatusesInput = z.infer<typeof reorderStatusesSchema>;

export type DeleteStatusQuery = z.infer<typeof deleteStatusQuerySchema>;
