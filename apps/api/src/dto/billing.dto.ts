import type { PlanLimits, PlanName } from "@workspace/shared";

export type BillingUsageDto = {
	members: number;
	projects: number;
	webhooks: number;
};

export type BillingDto = {
	plan: PlanName;
	limits: PlanLimits;
	usage: BillingUsageDto;
	stripeEnabled: boolean;
	currentPeriodEnd: string | null;
};

export type CheckoutResponseDto = {
	url: string | null;
};

export type PortalResponseDto = {
	url: string | null;
};
