import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import type Stripe from "stripe";
import type { BillingDao } from "../dao/billing.dao";
import type { MemberDao } from "../dao/member.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { WebhookDao } from "../dao/webhook.dao";
import type {
	BillingDto,
	CheckoutResponseDto,
	PortalResponseDto,
} from "../dto/billing.dto";
import {
	isStripeConfigured,
	type StripeSetup,
	stripeUnavailableMessage,
} from "../lib/stripe";
import type { PlanService } from "./plan.service";

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
}: {
	billingDao: BillingDao;
	memberDao: MemberDao;
	projectDao: ProjectDao;
	webhookDao: WebhookDao;
	stripeSetup: StripeSetup;
	mockEnabled: boolean;
	plans: PlanService;
}) => {
	const afterPlanChange = (orgId: string) => {
		plans.invalidatePlanCache(orgId);
	};

	const requireCompleteStripe = () => {
		if (isStripeConfigured(stripeSetup)) {
			return stripeSetup.context;
		}
		if (stripeSetup.status === "disabled" && mockEnabled) {
			return null;
		}
		throw new ApiError(
			503,
			ApiErrorCode.SERVICE_UNAVAILABLE,
			stripeUnavailableMessage(stripeSetup),
		);
	};

	return {
		getBilling: async (orgId: string): Promise<BillingDto> => {
			const subscription = await billingDao.findByOrg(orgId);
			const [members, projects, webhooks] = await Promise.all([
				memberDao.countByOrg(orgId),
				projectDao.countByOrg(orgId),
				webhookDao.countByOrg(orgId),
			]);
			return {
				plan: subscription.plan,
				limits: PLANS[subscription.plan],
				usage: { members, projects, webhooks },
				stripeEnabled: stripeSetup.status === "enabled",
				mockMode: stripeSetup.status === "disabled" && mockEnabled,
				currentPeriodEnd: subscription.currentPeriodEnd,
			};
		},

		createCheckout: async (
			orgId: string,
			origin: string,
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
			const seats = await memberDao.countByOrg(orgId);
			await billingDao.ensure(orgId);
			await billingDao.update(orgId, {
				plan: "pro",
				status: "active",
				seats,
			});
			afterPlanChange(orgId);
			return { url: null };
		},

		createPortal: async (
			orgId: string,
			origin: string,
		): Promise<PortalResponseDto> => {
			const stripe = requireCompleteStripe();
			if (stripe) {
				const subscription = await billingDao.findByOrg(orgId);
				if (!subscription.stripeCustomerId) {
					throw new ApiError(
						400,
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
			await billingDao.ensure(orgId);
			await billingDao.update(orgId, {
				plan: "free",
				status: "active",
				currentPeriodEnd: null,
			});
			afterPlanChange(orgId);
			return { url: null };
		},

		handleWebhookEvent: async (event: Stripe.Event): Promise<void> => {
			if (event.type === "checkout.session.completed") {
				const session = event.data.object;
				const orgId = session.client_reference_id;
				if (!orgId) {
					return;
				}
				const seats = await memberDao.countByOrg(orgId);
				await billingDao.ensure(orgId);
				await billingDao.update(orgId, {
					plan: "pro",
					status: "active",
					stripeCustomerId: customerIdOf(session.customer),
					stripeSubscriptionId:
						typeof session.subscription === "string"
							? session.subscription
							: (session.subscription?.id ?? null),
					seats,
				});
				afterPlanChange(orgId);
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
					afterPlanChange(row.orgId);
					return;
				}
				const periodEnd = subscriptionObject.items.data[0]?.current_period_end;
				await billingDao.update(row.orgId, {
					plan: subscriptionPlanFor(subscriptionObject.status),
					status: subscriptionObject.status,
					stripeSubscriptionId: subscriptionObject.id,
					currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
				});
				afterPlanChange(row.orgId);
			}
		},
	};
};

export type BillingService = ReturnType<typeof createBillingService>;
