import { z } from "zod";
import { NOTIFICATION_FILTERS } from "../notifications";
import { paginationQueryShape } from "./pagination";

export const notificationListQuerySchema = z.object({
	...paginationQueryShape(20),
	filter: z.enum(NOTIFICATION_FILTERS).default("all"),
});

export const updateIssueSubscriptionSchema = z.object({
	subscribed: z.boolean(),
	muted: z.boolean().optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export type UpdateIssueSubscriptionInput = z.infer<
	typeof updateIssueSubscriptionSchema
>;
