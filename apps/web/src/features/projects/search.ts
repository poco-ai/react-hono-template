import { z } from "zod";

const archivedFlag = z
	.union([z.boolean(), z.literal(1), z.literal("1"), z.literal("true")])
	.transform((value) => value !== false);

export const projectsSearchSchema = z.object({
	archived: archivedFlag.optional().catch(false),
});
