import { AUDIT_ACTIONS } from "@workspace/shared";
import { z } from "zod";

export const auditSearchSchema = z.object({
	page: z.coerce.number().int().positive().optional().catch(1),
	action: z.enum(AUDIT_ACTIONS).optional().catch(undefined),
	actorId: z.string().trim().min(1).max(200).optional().catch(undefined),
	from: z.string().optional().catch(undefined),
	to: z.string().optional().catch(undefined),
});
