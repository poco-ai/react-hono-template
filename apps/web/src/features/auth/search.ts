import { z } from "zod";

export const loginSearchSchema = z.object({
	redirect: z.string().optional(),
});

export const resetPasswordSearchSchema = z.object({
	token: z.string().optional(),
});
