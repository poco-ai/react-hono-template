import { NOTIFICATION_FILTERS } from "@workspace/shared";
import { z } from "zod";

/**
 * Inbox URL state. Unknown or empty `?filter=` values fall back to `all`
 * instead of erroring, so stale links keep working.
 */
export const inboxSearchSchema = z.object({
	filter: z.enum(NOTIFICATION_FILTERS).catch("all"),
});

export type InboxSearch = z.infer<typeof inboxSearchSchema>;
