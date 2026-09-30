import { z } from "zod";

export const billingSearchSchema = z.object({
	checkout: z.enum(["success", "canceled"]).optional().catch(undefined),
});
