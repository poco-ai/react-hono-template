import { z } from "zod";

export const runtimeConfigSchema = z.object({
	version: z.literal(1).default(1),
	maintenance: z.boolean().default(false),
	announcement: z.string().trim().max(500).nullable().default(null),
	features: z.record(z.string(), z.boolean()).default({}),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

// Writes must send the complete object so omitted fields cannot silently
// overwrite the stored config.
export const runtimeConfigUpdateSchema = z.object({
	version: z.literal(1),
	maintenance: z.boolean(),
	announcement: z.string().trim().max(500).nullable(),
	features: z.record(z.string(), z.boolean()),
});

export type UpdateRuntimeConfigInput = z.infer<
	typeof runtimeConfigUpdateSchema
>;

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = runtimeConfigSchema.parse(
	{},
);
