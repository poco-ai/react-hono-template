import type { AiQuotaGuard } from "./quota";
import type { StorageUsage } from "./storage-usage";
import type { WebhookDispatcher } from "./webhook-dispatcher";

/**
 * Structural ports for *soft* cross-feature dependencies.
 *
 * A module may consume a feature it does not hard-depend on (attachments
 * without billing, recurrences without webhooks). Importing the other
 * feature's `module.ts` merely for its contribution type would break the
 * generated project when that slice is trimmed, so soft consumers type the
 * dependency structurally here and resolve it with `ctx.features.find`.
 */

/** Billing surface consumed by soft dependants (ai quota, attachments limits). */
export type BillingFeaturePort = {
	services: { quotaService: AiQuotaGuard };
	extras: { storageUsage: StorageUsage };
};

/** Webhook dispatcher surface consumed by soft dependants. */
export type WebhooksFeaturePort = {
	services: { webhookDeliveryService: WebhookDispatcher };
};
