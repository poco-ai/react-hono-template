import { z } from "zod";

export const generalSettingsSearchSchema = z.object({
	denied: z.boolean().optional().catch(undefined),
});
