import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import type Stripe from "stripe";
import type { BillingDao } from "../dao/billing.dao";
import type { MemberDao } from "../dao/member.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { WebhookDao } from "../dao/webhook.dao";
import type {
	BillingDto,
	BillingLimits,
	CheckoutResponseDto,
	PortalResponseDto,
} from "../dto/billing.dto";
import {
	isStripeConfigured,
	type StripeSetup,
	stripeUnavailableMessage,
} from "../lib/stripe";
import type { AuditService } from "./audit.service";
import type { PlanService } from "./plan.service";
import type { QuotaService } from "./quota.service";
import type { StorageUsageService } from "./storage-usage.service";

const subscriptionPlanFor = (status: string) =>
	status === "active" || status === "trialing" || status === "past_due"
		? ("pro" as const)
		: ("free" as const);

const customerIdOf = (
	customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null => {
	if (typeof customer === "string") {
		return customer;
	}
	return customer?.id ?? null;
};

export const createBillingService = ({
	billingDao,
	memberDao,
	projectDao,
	webhookDao,
	stripeSetup,
	mockEnabled,
	plans,
	storageUsage,
	quota,
	audit,
}: {
	billingDao: BillingDao;
	memberDao: MemberDao;
	projectDao: ProjectDao;
	webhookDao: WebhookDao;
	stripeSetup: StripeSetup;
	mockEnabled: boolean;
	plans: PlanService;
	storageUsage?: Pick<StorageUsageService, "getOrgUsage">;
	quota?: Pick<QuotaService, "overview">;
	audit?: Pick<AuditService, "record">;
}) => {
	const afterPlanChange = async (
		orgId: string,
		previousPlan: string,
		nextPlan: string,
		actor: { actorType: "user" | "system"; actorId?: string | null },
	) => {
		await plans.invalidatePlanCache(orgId);
		if (previousPlan === nextPlan) return;
		await audit?.record({
			orgId,
			actorType: actor.actorType,
			actorId: actor.actorId,
			action: "billing.plan_changed",
			targetType: "subscription",
			targetId: orgId,
			before: { plan: previousPlan },
			after: { plan: nextPlan },
		});
	};

	const requireCompleteStripe = () => {
		if (isStripeConfigured(stripeSetup)) {
			return stripeSetup.context;
		}
		if (stripeSetup.status === "disabled" && mockEnabled) {
			return null;
		}
		throw new ApiError(
			ApiErrorCode.SERVICE_UNAVAILABLE,
			stripeUnavailableMessage(stripeSetup),
		);
	};

	return {
		getBilling: async (orgId: string): Promise<BillingDto> => {
			const subscription = await billingDao.findByOrg(orgId);
			const [members, projects, webhooks, storage] = await Promise.all([
				memberDao.countByOrg(orgId),
				projectDao.countByOrg(orgId),
				webhookDao.countByOrg(orgId),
				storageUsage ? storageUsage.getOrgUsage(orgId) : Promise.resolve(null),
			]);
			const overview = quota
				? await quota.overview(orgId, storage?.total ?? 0)
				: {
						meters: [],
						credits: { balance: 0, reserved: 0, available: 0 },
					};
			const storageMeter = overview.meters.find(
				(meter) => meter.meter === "storage.bytes",
			);
			const aiMeter = overview.meters.find(
				(meter) => meter.meter === "ai.tokens",
			);
			const limits: BillingLimits = {
				...PLANS[subscription.plan],
				...(storageMeter ? { storageBytes: storageMeter.included } : {}),
				...(aiMeter ? { aiMonthlyTokens: aiMeter.included } : {}),
			};
			return {
				plan: subscription.plan,
				limits,
				usage: {
					members,
					projects,
					webhooks,
					storageBytes: storage?.total ?? 0,
				},
				meters: overview.meters,
				credits: overview.credits,
				stripeEnabled: stripeSetup.status === "enabled",
				mockMode: stripeSetup.status === "disabled" && mockEnabled,
				currentPeriodEnd: subscription.currentPeriodEnd,
			};
		},

		createCheckout: async (
			orgId: string,
			origin: string,
			actorId?: string,
		): Promise<CheckoutResponseDto> => {
			const stripe = requireCompleteStripe();
			if (stripe) {
				const ownerEmail = await memberDao.findOwnerEmail(orgId);
				const session = await stripe.client.checkout.sessions.create({
					mode: "subscription",
					line_items: [{ price: stripe.priceId, quantity: 1 }],
					customer_email: ownerEmail ?? undefined,
					client_reference_id: orgId,
					success_url: `${origin}/orgs/${orgId}/settings/billing?checkout=success`,
					cancel_url: `${origin}/orgs/${orgId}/settings/billing?checkout=canceled`,
				});
				return { url: session.url };
			}
			const previousPlan =
				(await billingDao.findByOrg?.(orgId))?.plan ?? "free";
			const seats = await memberDao.countByOrg(orgId);
			await billingDao.upsert(orgId, {
				plan: "pro",
				status: "active",
				seats,
			});
			await afterPlanChange(orgId, previousPlan, "pro", {
				actorType: "user",
				actorId,
			});
			return { url: null };
		},

		createPortal: async (
			orgId: string,
			origin: string,
			actorId?: string,
		): Promise<PortalResponseDto> => {
			const stripe = requireCompleteStripe();
			if (stripe) {
				const subscription = await billingDao.findByOrg(orgId);
				if (!subscription.stripeCustomerId) {
					throw new ApiError(
						ApiErrorCode.BILLING_ERROR,
						"No billing account for this organization",
					);
				}
				const session = await stripe.client.billingPortal.sessions.create({
					customer: subscription.stripeCustomerId,
					return_url: `${origin}/orgs/${orgId}/settings/billing`,
				});
				return { url: session.url };
			}
			const previousPlan =
				(await billingDao.findByOrg?.(orgId))?.plan ?? "free";
			await billingDao.upsert(orgId, {
				plan: "free",
				status: "active",
				currentPeriodEnd: null,
			});
			await afterPlanChange(orgId, previousPlan, "free", {
				actorType: "user",
				actorId,
			});
			return { url: null };
		},

		handleWebhookEvent: async (event: Stripe.Event): Promise<void> => {
			if (event.type === "checkout.session.completed") {
				const session = event.data.object;
				const orgId = session.client_reference_id;
				if (!orgId) {
					return;
				}
				const previousPlan =
					(await billingDao.findByOrg?.(orgId))?.plan ?? "free";
				const seats = await memberDao.countByOrg(orgId);
				await billingDao.upsert(orgId, {
					plan: "pro",
					status: "active",
					stripeCustomerId: customerIdOf(session.customer),
					stripeSubscriptionId:
						typeof session.subscription === "string"
							? session.subscription
							: (session.subscription?.id ?? null),
					seats,
				});
				await afterPlanChange(orgId, previousPlan, "pro", {
					actorType: "system",
				});
				return;
			}
			if (
				event.type === "customer.subscription.updated" ||
				event.type === "customer.subscription.deleted"
			) {
				const subscriptionObject = event.data.object;
				const customerId = customerIdOf(subscriptionObject.customer);
				if (!customerId) {
					return;
				}
				const row = await billingDao.findByStripeCustomer(customerId);
				if (!row) {
					return;
				}
				if (event.type === "customer.subscription.deleted") {
					await billingDao.update(row.orgId, {
						plan: "free",
						status: "canceled",
						stripeSubscriptionId: null,
						currentPeriodEnd: null,
					});
					await afterPlanChange(row.orgId, row.plan, "free", {
						actorType: "system",
					});
					return;
				}
				const periodEnd = subscriptionObject.items.data[0]?.current_period_end;
				const nextPlan = subscriptionPlanFor(subscriptionObject.status);
				await billingDao.update(row.orgId, {
					plan: nextPlan,
					status: subscriptionObject.status,
					stripeSubscriptionId: subscriptionObject.id,
					currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
				});
				await afterPlanChange(row.orgId, row.plan, nextPlan, {
					actorType: "system",
				});
			}
		},
	};
};

export type BillingService = ReturnType<typeof createBillingService>;
