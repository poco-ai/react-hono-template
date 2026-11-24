import type { BackgroundFn } from "../background";

/**
 * Port: best-effort event fan-out consumed by core write paths
 * (issues/comments/relations/recurrences/attachments).
 *
 * The type lives in core so those services keep compiling when the webhooks
 * feature is trimmed from a preset — the feature supplies the implementation
 * at assembly time (`webhook-delivery.service.ts` re-exports this type for
 * compatibility).
 */
export type WebhookDispatcher = {
	dispatch: (
		orgId: string,
		event: string,
		data: unknown,
		background?: BackgroundFn,
	) => Promise<void>;
};
