import { z } from "zod";
import { PLANS, type PlanName } from "./plans";
import { paginationQueryShape } from "./schemas/pagination";

/**
 * Consumable meters. Seat-style caps (members, projects, webhooks, saved views,
 * per-issue attachment counts, max upload size) stay on `PLANS` and are not
 * credits: deleting the row gives the slot back.
 */
export const METER_IDS = ["ai.tokens", "storage.bytes"] as const;

export type MeterId = (typeof METER_IDS)[number];

export const QUOTA_MODES = ["independent", "pooled", "hybrid"] as const;

export type QuotaMode = (typeof QUOTA_MODES)[number];

export type MeterDefinition = {
	id: MeterId;
	unit: "tokens" | "bytes";
	aggregation: "counter" | "gauge";
	/** Counters reset on a UTC calendar month. Gauges are a live stock. */
	period: "month" | "none";
};

export const METERS: Record<MeterId, MeterDefinition> = {
	"ai.tokens": {
		id: "ai.tokens",
		unit: "tokens",
		aggregation: "counter",
		period: "month",
	},
	"storage.bytes": {
		id: "storage.bytes",
		unit: "bytes",
		aggregation: "gauge",
		period: "none",
	},
};

/** How many meter units make one credit. Charges round up. */
export const DEFAULT_CREDIT_RATES: Record<MeterId, number> = {
	"ai.tokens": 1000,
	"storage.bytes": 1024 * 1024,
};

export const GAUGE_PERIOD_KEY = "gauge";

export type MeterPolicy = {
	mode: QuotaMode;
	/** Included quantity in the meter's own unit. `-1` means unlimited. */
	included: number;
	creditRate: number;
};

export const isMeterId = (value: string): value is MeterId =>
	(METER_IDS as readonly string[]).includes(value);

export const isQuotaMode = (value: string): value is QuotaMode =>
	(QUOTA_MODES as readonly string[]).includes(value);

export const defaultMeterPolicy = (
	plan: PlanName,
	meter: MeterId,
): MeterPolicy => {
	if (meter === "ai.tokens") {
		return {
			mode: "independent",
			included: PLANS[plan].aiMonthlyTokens,
			creditRate: DEFAULT_CREDIT_RATES["ai.tokens"],
		};
	}
	return {
		mode: "independent",
		included: PLANS[plan].storageBytes,
		creditRate: DEFAULT_CREDIT_RATES["storage.bytes"],
	};
};

export const monthPeriodKey = (date: Date): string => {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
};

export const periodKeyFor = (meter: MeterId, now: Date): string =>
	METERS[meter].period === "month" ? monthPeriodKey(now) : GAUGE_PERIOD_KEY;

/** Integer credits for a meter quantity. Zero rate cannot draw the pool. */
export const creditsForQuantity = (
	quantity: number,
	creditRate: number,
): number => {
	if (quantity <= 0 || creditRate <= 0) return 0;
	return Math.ceil(quantity / creditRate);
};

/**
 * Bytes that draw the shared pool.
 * Independent meters never do. Pooled meters bill the whole stock.
 * Hybrid meters bill only the part above the included allowance.
 */
export const billableBytes = (gauge: number, policy: MeterPolicy): number => {
	const bytes = Math.max(0, Math.trunc(gauge));
	if (policy.mode === "independent") return 0;
	if (policy.mode === "pooled") return bytes;
	if (policy.included < 0) return 0;
	return Math.max(0, bytes - policy.included);
};

export type DrawResult =
	| { ok: true; meterHold: number; creditsHold: number }
	| { ok: false };

/**
 * Split a counter quantity across the meter's included balance and the shared
 * credit pool. Draw order is included, then credits, then deny.
 * Unlimited included (`included < 0`) still reports a meter hold so usage is
 * recorded; the balance row allows it.
 */
export const planDraw = (input: {
	mode: QuotaMode;
	included: number;
	creditRate: number;
	consumed: number;
	reserved: number;
	creditsAvailable: number;
	quantity: number;
}): DrawResult => {
	const quantity = Math.max(0, Math.trunc(input.quantity));
	if (quantity === 0) return { ok: true, meterHold: 0, creditsHold: 0 };

	const unlimited = input.included < 0;
	const room = unlimited
		? Number.POSITIVE_INFINITY
		: Math.max(0, input.included - input.consumed - input.reserved);

	if (input.mode === "pooled") {
		if (input.creditRate <= 0) return { ok: false };
		const creditsHold = creditsForQuantity(quantity, input.creditRate);
		if (creditsHold > input.creditsAvailable) return { ok: false };
		return { ok: true, meterHold: 0, creditsHold };
	}

	if (input.mode === "independent") {
		if (room < quantity) return { ok: false };
		return { ok: true, meterHold: quantity, creditsHold: 0 };
	}

	const meterHold = unlimited ? quantity : Math.min(room, quantity);
	const remainder = quantity - meterHold;
	if (remainder === 0) return { ok: true, meterHold, creditsHold: 0 };
	if (input.creditRate <= 0) return { ok: false };
	const creditsHold = creditsForQuantity(remainder, input.creditRate);
	if (creditsHold > input.creditsAvailable) return { ok: false };
	return { ok: true, meterHold, creditsHold };
};

export const AUDIT_ACTIONS = [
	"member.invited",
	"member.removed",
	"member.role_changed",
	"apikey.created",
	"apikey.revoked",
	"billing.plan_changed",
	"quota.adjusted",
	"quota.policy_changed",
	"webhook.created",
	"webhook.deleted",
	"ai.settings_changed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTOR_TYPES = ["user", "api_key", "system"] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_RESULTS = ["success", "denied"] as const;

export type AuditResult = (typeof AUDIT_RESULTS)[number];

const SENSITIVE_KEY =
	/secret|password|token|api[-_]?key|prompt|otp|authorization|credential|content/i;

const SECRET_TEXT = /\bsk_[A-Za-z0-9_-]{8,}\b/;

/** Drops secrets, prompts and file bodies before an audit row is stored. */
export const redactAuditValue = (value: unknown, depth = 0): unknown => {
	if (depth > 6) return null;
	if (Array.isArray(value)) {
		return value.map((item) => redactAuditValue(item, depth + 1));
	}
	if (value && typeof value === "object") {
		const redacted: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			redacted[key] = SENSITIVE_KEY.test(key)
				? "[redacted]"
				: redactAuditValue(item, depth + 1);
		}
		return redacted;
	}
	if (typeof value === "string" && SECRET_TEXT.test(value)) return "[redacted]";
	return value;
};

export const updateQuotaPolicySchema = z.object({
	meter: z.enum(METER_IDS),
	mode: z.enum(QUOTA_MODES),
	included: z.number().int().min(-1),
	creditRate: z.number().int().positive(),
});

export type UpdateQuotaPolicyInput = z.infer<typeof updateQuotaPolicySchema>;

export const adjustCreditsSchema = z.object({
	amount: z
		.number()
		.int()
		.refine((value) => value !== 0, "Amount must be non-zero"),
	reason: z.string().trim().min(1).max(500),
	idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export type AdjustCreditsInput = z.infer<typeof adjustCreditsSchema>;

export const auditListQuerySchema = z.object({
	...paginationQueryShape(20),
	action: z.enum(AUDIT_ACTIONS).optional(),
	actorId: z.string().trim().min(1).max(200).optional(),
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
});

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const adminAuditListQuerySchema = auditListQuerySchema.extend({
	orgId: z.string().trim().min(1).optional(),
});

export type AdminAuditListQuery = z.infer<typeof adminAuditListQuerySchema>;
