import type { PlanName } from "@workspace/shared";

export type SubscriptionDto = {
	orgId: string;
	plan: PlanName;
	status: string;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	seats: number;
	currentPeriodEnd: string | null;
	createdAt: string;
	updatedAt: string;
};

export type SubscriptionPatch = {
	plan?: PlanName;
	status?: string;
	stripeCustomerId?: string | null;
	stripeSubscriptionId?: string | null;
	seats?: number;
	currentPeriodEnd?: Date | null;
};
