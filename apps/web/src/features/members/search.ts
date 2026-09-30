import { z } from "zod";

export const inviteSearchSchema = z.object({
	invitationId: z.string().min(1),
});
