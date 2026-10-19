import { z } from "zod";

export const runtimeConfigSchema = z.object({
	version: z.literal(1).default(1),
	maintenance: z.boolean().default(false),
	announcement: z.string().trim().max(500).nullable().default(null),
	features: z.record(z.string(), z.boolean()).default({}),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = runtimeConfigSchema.parse(
	{},
);
