import { FAVORITE_ENTITY_TYPES } from "@workspace/shared";
import type { Context } from "hono";
import type { Env as HonoEnv } from "hono/types";
import { z } from "zod";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";

/**
 * Path-param schemas shared by the resource routers. Routers attach them with
 * `validate(xxxParams, "param")` after the org/role middleware, so a 403/404
 * is returned before an invalid path segment can produce a 400.
 *
 * Controllers read the parsed shapes from `c.req.valid("param")`.
 */

/** Non-empty path id (issues, projects, comments, labels, ...). */
export const idParam = z.string().min(1);

export const ISSUE_NUMBER_MESSAGE = "Issue number must be a positive integer";

/**
 * Issue numbers stay positive integers in the URL; the validated value is a
 * number, matching the previous `requireIssueNumber` helper.
 */
export const issueNumberParam = z
	.string()
	.refine((value) => /^\d+$/.test(value) && Number(value) >= 1, {
		message: ISSUE_NUMBER_MESSAGE,
	})
	.transform(Number);

export const projectParams = z.object({
	projectId: idParam,
});

export const issueParams = projectParams.extend({
	number: issueNumberParam,
});

export const commentParams = issueParams.extend({
	commentId: idParam,
});

export const attachmentParams = issueParams.extend({
	attachmentId: idParam,
});

export const commentAttachmentParams = commentParams.extend({
	attachmentId: idParam,
});

export const cycleParams = projectParams.extend({
	cycleId: idParam,
});

export const projectUpdateParams = projectParams.extend({
	updateId: idParam,
});

export const recurrenceParams = projectParams.extend({
	recurrenceId: idParam,
});

export const relationParams = issueParams.extend({
	relationId: idParam,
});

export const labelParams = z.object({
	labelId: idParam,
});

export const statusParams = z.object({
	statusId: idParam,
});

export const viewParams = z.object({
	viewId: idParam,
});

export const webhookParams = z.object({
	webhookId: idParam,
});

export const webhookDeliveryParams = z.object({
	deliveryId: idParam,
});

export const notificationParams = z.object({
	notificationId: idParam,
});

export const apiKeyParams = z.object({
	keyId: idParam,
});

export const aiConversationParams = z.object({
	id: idParam,
});

export const favoriteParams = z.object({
	entityType: z.enum(FAVORITE_ENTITY_TYPES),
	entityId: idParam,
});

export const adminUserParams = z.object({
	id: idParam,
});

export const adminOrgParams = z.object({
	orgId: idParam,
});

export const issueTemplateParams = z.object({
	templateId: idParam,
});

export const mediaParams = z.object({
	assetId: idParam,
});

/**
 * Context type for controllers whose route has a `validate(xxxParams, "param")`
 * middleware. `c.req.valid("param")` then returns the schema's output type.
 */
export type ParamContext<T, E extends HonoEnv = SessionEnv & OrgEnv> = Context<
	E,
	string,
	{ out: { param: T } }
>;

/** Public routes (no session/org middleware) still get typed path params. */
export type PublicParamContext<T> = ParamContext<T, HonoEnv>;

export type ProjectParams = z.infer<typeof projectParams>;
export type IssueParams = z.infer<typeof issueParams>;
export type CommentParams = z.infer<typeof commentParams>;
export type AttachmentParams = z.infer<typeof attachmentParams>;
export type CommentAttachmentParams = z.infer<typeof commentAttachmentParams>;
export type CycleParams = z.infer<typeof cycleParams>;
export type ProjectUpdateParams = z.infer<typeof projectUpdateParams>;
export type RecurrenceParams = z.infer<typeof recurrenceParams>;
export type RelationParams = z.infer<typeof relationParams>;
export type LabelParams = z.infer<typeof labelParams>;
export type StatusParams = z.infer<typeof statusParams>;
export type ViewParams = z.infer<typeof viewParams>;
export type WebhookParams = z.infer<typeof webhookParams>;
export type WebhookDeliveryParams = z.infer<typeof webhookDeliveryParams>;
export type NotificationParams = z.infer<typeof notificationParams>;
export type ApiKeyParams = z.infer<typeof apiKeyParams>;
export type AiConversationParams = z.infer<typeof aiConversationParams>;
export type FavoriteParams = z.infer<typeof favoriteParams>;
export type IssueTemplateParams = z.infer<typeof issueTemplateParams>;
export type MediaParams = z.infer<typeof mediaParams>;
export type AdminUserParams = z.infer<typeof adminUserParams>;
export type AdminOrgParams = z.infer<typeof adminOrgParams>;
