import type { FeatureModule, StripeWebhookHandler } from "../../core/compose";
import type { FullFeatureContext } from "../../feature-context";
import type { AttachmentsContribution } from "../attachments/module";
import type { ProjectsContribution } from "../projects/module";
import type { WebhooksContribution } from "../webhooks/module";
import { createStripeController } from "./controllers/stripe.controller";
import { createBillingDao } from "./dao/billing.dao";
import { createQuotaDao } from "./dao/quota.dao";
import { type StripeSetup, setupStripe } from "./lib/stripe";
import { createAdminQuotaRoutes } from "./routes/admin-quota";
import { createBillingRoutes } from "./routes/billing";
import { createBillingService } from "./services/billing.service";
import { createQuotaService } from "./services/quota.service";
import { createStorageUsageService } from "./services/storage-usage.service";

export type BillingDaos = { billingDao: ReturnType<typeof createBillingDao> };

/**
 * Billing: subscriptions, quota ledger and storage accounting. Registers
 * first among the features (mirroring the former dependencies.ts, where
 * `quotaService` was the first feature service built) so every plan-gated
 * feature can consume quota and storage usage.
 *
 * The DB-backed plan source replaces the holder's static free default —
 * the subscription row is billing's only input to plan resolution.
 */
export const billingModule = {
	id: "billing",
	platform: (env) => ({
		stripeSetup: setupStripe({
			secretKey: env.STRIPE_SECRET_KEY,
			priceId: env.STRIPE_PRICE_ID,
			webhookSecret: env.STRIPE_WEBHOOK_SECRET,
		}),
	}),
	createDaos: ({ db }) => ({ billingDao: createBillingDao(db) }),
	register: (ctx) => {
		ctx.setPlanSource({
			load: async (orgId) => {
				const subscription = await ctx.daos.billingDao.findByOrg(orgId);
				return subscription.plan === "pro" ? "pro" : "free";
			},
		});
		const quotaService = createQuotaService({
			dao: createQuotaDao(ctx.db),
			plans: ctx.core.planService,
			audit: ctx.core.auditService,
			// Live array: ai appends its usage sink when it registers later
			// in phase B; the quota service reads it at settle time.
			usageSinks: ctx.quotaUsageSinks,
		});
		const attachments =
			ctx.features.get<AttachmentsContribution>("attachments");
		const storageUsageService = createStorageUsageService({
			attachmentDao: attachments.daos.attachmentDao,
			pendingUploadDao: attachments.daos.pendingUploadDao,
			mediaAssetDao: attachments.daos.mediaAssetDao,
			plans: ctx.core.planService,
			quota: quotaService,
		});
		const billingService = createBillingService({
			billingDao: ctx.daos.billingDao,
			memberDao: ctx.daos.memberDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			webhookDao:
				ctx.features.get<WebhooksContribution>("webhooks").daos.webhookDao,
			stripeSetup: ctx.stripeSetup as StripeSetup,
			mockEnabled: ctx.billingMockEnabled,
			plans: ctx.core.planService,
			storageUsage: storageUsageService,
			quota: quotaService,
			audit: ctx.core.auditService,
		});
		// The Stripe webhook sits outside the typed Hono chain (AppType); the
		// billing module contributes it as an app-level handler so `app.ts` never
		// imports the feature.
		const stripeController = createStripeController({
			service: billingService,
			stripeSetup: ctx.stripeSetup as StripeSetup,
		});
		return {
			services: { billingService, quotaService },
			routes: [
				{
					phase: "admin",
					create: () => createAdminQuotaRoutes({ quota: quotaService }),
				},
				{
					phase: "org",
					create: () => createBillingRoutes(billingService),
				},
			],
			// Frozen organizations keep this write path so the subscription
			// can be managed or restored.
			freezeWriteExempt: ["/billing"],
			// Storage accounting is billing-internal (not part of the public
			// service graph) but the attachments feature consumes it.
			extras: {
				storageUsage: storageUsageService,
				stripeWebhook: ((c) =>
					stripeController.webhook(c as never)) as StripeWebhookHandler,
			},
		};
	},
} satisfies FeatureModule<BillingDaos, FullFeatureContext>;

export type BillingContribution = ReturnType<typeof billingModule.register> & {
	daos: BillingDaos;
};
