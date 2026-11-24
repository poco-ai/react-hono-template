import type {
	MeterId,
	PlanLimits,
	PlanName,
	QuotaMode,
} from "@workspace/shared";

export type BillingUsageDto = {
	members: number;
	projects: number;
	webhooks: number;
	storageBytes: number;
};

export type MeterUsageDto = {
	meter: MeterId;
	mode: QuotaMode;
	unit: "tokens" | "bytes";
	included: number;
	used: number;
	reserved: number;
	creditRate: number;
};

export type CreditPoolDto = {
	balance: number;
	reserved: number;
	available: number;
};

export type BillingLimits = {
	[K in keyof PlanLimits]: number;
};

export type BillingDto = {
	plan: PlanName;
	limits: BillingLimits;
	usage: BillingUsageDto;
	meters: MeterUsageDto[];
	credits: CreditPoolDto;
	stripeEnabled: boolean;
	mockMode: boolean;
	currentPeriodEnd: string | null;
};

export type CheckoutResponseDto = {
	url: string | null;
};

export type PortalResponseDto = {
	url: string | null;
};
