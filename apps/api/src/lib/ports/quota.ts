import type { AuditActorType, MeterId } from "@workspace/shared";

/**
 * Ports: quota-ledger shapes consumed by storage-usage (billing) and AI chat.
 *
 * The types live in core so those consumers keep compiling when the billing
 * feature is trimmed from a preset — `quota.service` satisfies them
 * structurally and is injected at assembly time. Reservation rows are
 * deliberately opaque (`unknown`): every consumer here treats authorize as a
 * guard and never reads the row back.
 */

/** Actor attribution attached to quota holds and gauge adjustments. */
export type QuotaActorPort = {
	actorType: AuditActorType;
	actorId?: string | null;
};

/** Extra dimensions recorded with a meter hold. */
export type QuotaDimensionsPort = Record<
	string,
	string | number | boolean | null
>;

/**
 * Usage recorded after a reservation wins its finalize — exactly once per
 * settle. The AI feature maps this onto its daily usage table.
 */
export type QuotaUsageRecord = {
	userId: string;
	inputTokens: number;
	outputTokens: number;
	toolCalls: number;
};

/** Sink invoked by quota settle after the reservation commit wins. */
export type QuotaUsageSink = (
	orgId: string,
	usage: QuotaUsageRecord,
) => Promise<void>;

/** Storage gauge + hold surface used by storage-usage.service. */
export type StorageQuota = {
	authorizeStorage: (input: {
		orgId: string;
		currentBytes: number;
		incomingBytes: number;
		idempotencyKey: string;
		actor?: QuotaActorPort;
	}) => Promise<unknown>;
	settle: (input: {
		orgId: string;
		idempotencyKey: string;
		actualQuantity: number;
		consumeAll?: boolean;
	}) => Promise<void>;
	release: (input: { orgId: string; idempotencyKey: string }) => Promise<void>;
	reconcileGauge: (input: {
		orgId: string;
		previousBytes: number;
		nextBytes: number;
		sourceId: string;
		actor?: QuotaActorPort;
	}) => Promise<void>;
};

/** Token meter surface used by ai-chat.service. */
export type AiQuotaGuard = {
	authorize: (input: {
		orgId: string;
		meter: MeterId;
		quantity: number;
		idempotencyKey: string;
		actor?: QuotaActorPort;
		dimensions?: QuotaDimensionsPort;
	}) => Promise<unknown>;
	settle: (input: {
		orgId: string;
		idempotencyKey: string;
		actualQuantity: number;
		consumeAll?: boolean;
		aiUsage?: {
			userId: string;
			inputTokens: number;
			outputTokens: number;
			toolCalls: number;
		};
	}) => Promise<void>;
	release: (input: { orgId: string; idempotencyKey: string }) => Promise<void>;
};
