import {
	ApiError,
	ApiErrorCode,
	type AuditActorType,
	billableBytes,
	creditsForQuantity,
	defaultMeterPolicy,
	isQuotaMode,
	METERS,
	type MeterId,
	type MeterPolicy,
	type PlanName,
	periodKeyFor,
	planDraw,
} from "@workspace/shared";
import type {
	QuotaDao,
	QuotaReservationRow,
	ReservationInsert,
} from "../dao/quota.dao";
import type { PlanNameSource } from "../lib/ports/plan";
import type {
	QuotaDimensionsPort,
	QuotaUsageRecord,
	QuotaUsageSink,
} from "../lib/ports/quota";
import type { AuditService } from "./audit.service";

export type QuotaActor = {
	actorType: AuditActorType;
	actorId?: string | null;
};

export type QuotaDimensions = QuotaDimensionsPort;

const storageQuota = () =>
	new ApiError(
		ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
		"Organization storage quota exceeded",
	);

const aiQuota = (plan: PlanName) =>
	new ApiError(
		ApiErrorCode.AI_QUOTA_EXCEEDED,
		`Monthly AI token quota exceeded on the ${plan} plan.`,
	);

const splitActual = (input: {
	actual: number;
	meterHeld: number;
	creditsHeld: number;
	creditRate: number;
}) => {
	const actual = Math.max(0, Math.trunc(input.actual));
	const meterUsed = Math.min(input.meterHeld, actual);
	const remainder = actual - meterUsed;
	const creditsUsed =
		remainder <= 0
			? 0
			: Math.min(
					input.creditsHeld,
					creditsForQuantity(remainder, input.creditRate),
				);
	return { actual, meterUsed, creditsUsed };
};

export const createQuotaService = ({
	dao,
	plans,
	audit,
	usageSinks = [],
	now = () => new Date(),
}: {
	dao: QuotaDao;
	plans: PlanNameSource;
	audit?: Pick<AuditService, "prepare" | "record">;
	/**
	 * Usage sinks run after a settle wins its finalize (exactly once per
	 * reservation). The ai feature registers one that records daily usage.
	 */
	usageSinks?: QuotaUsageSink[];
	now?: () => Date;
}) => {
	const resolvePolicy = async (
		orgId: string,
		meter: MeterId,
	): Promise<{ plan: PlanName; policy: MeterPolicy }> => {
		const plan = await plans.getPlanForOrg(orgId);
		const override = await dao.findPolicy(orgId, meter);
		if (
			override &&
			isQuotaMode(override.mode) &&
			Number.isInteger(override.included) &&
			Number.isInteger(override.creditRate) &&
			override.creditRate > 0
		) {
			return {
				plan,
				policy: {
					mode: override.mode,
					included: override.included,
					creditRate: override.creditRate,
				},
			};
		}
		return { plan, policy: defaultMeterPolicy(plan, meter) };
	};

	const hold = async (input: {
		orgId: string;
		meter: MeterId;
		periodKey: string;
		quantity: number;
		meterHold: number;
		creditsHold: number;
		idempotencyKey: string;
		actor?: QuotaActor;
		dimensions?: QuotaDimensions;
		deny: () => ApiError;
	}): Promise<QuotaReservationRow> => {
		const existing = await dao.findReservationByKey(
			input.orgId,
			input.idempotencyKey,
		);
		if (existing) return existing;

		if (input.meterHold > 0) {
			const ok = await dao.tryAddMeterReserved(
				input.orgId,
				input.meter,
				input.periodKey,
				input.meterHold,
			);
			if (!ok) throw input.deny();
		}
		if (input.creditsHold > 0) {
			await dao.ensureCreditBalance(input.orgId);
			const ok = await dao.tryAddCreditReserved(input.orgId, input.creditsHold);
			if (!ok) {
				await dao.releaseMeterReserved(
					input.orgId,
					input.meter,
					input.periodKey,
					input.meterHold,
				);
				throw input.deny();
			}
		}

		const row: ReservationInsert = {
			id: crypto.randomUUID(),
			orgId: input.orgId,
			meter: input.meter,
			periodKey: input.periodKey,
			estimated: input.quantity,
			meterHeld: input.meterHold,
			creditsHeld: input.creditsHold,
			idempotencyKey: input.idempotencyKey,
			actorId: input.actor?.actorId ?? null,
			dimensions: input.dimensions ?? null,
		};
		try {
			await dao.insertReservation(row);
		} catch (error) {
			await dao.releaseMeterReserved(
				input.orgId,
				input.meter,
				input.periodKey,
				input.meterHold,
			);
			await dao.releaseCreditReserved(input.orgId, input.creditsHold);
			const raced = await dao.findReservationByKey(
				input.orgId,
				input.idempotencyKey,
			);
			if (raced) return raced;
			throw error;
		}
		return {
			id: row.id,
			orgId: row.orgId,
			meter: row.meter,
			periodKey: row.periodKey,
			estimated: row.estimated,
			settled: null,
			meterHeld: row.meterHeld,
			creditsHeld: row.creditsHeld,
			status: "held",
			idempotencyKey: row.idempotencyKey,
			settleToken: null,
			actorId: row.actorId,
		};
	};

	const finalize = async (
		reservation: QuotaReservationRow,
		input: {
			status: "settled" | "released";
			settled: number | null;
			meterUsed: number;
			creditsUsed: number;
			sourceType: string;
			quantity: number;
			creditsDelta: number;
		},
	): Promise<boolean> => {
		if (reservation.status !== "held") return false;
		return dao.finalizeReservation({
			reservationId: reservation.id,
			orgId: reservation.orgId,
			meter: reservation.meter,
			periodKey: reservation.periodKey,
			status: input.status,
			settled: input.settled,
			meterHeld: reservation.meterHeld,
			meterUsed: input.meterUsed,
			creditsHeld: reservation.creditsHeld,
			creditsUsed: input.creditsUsed,
			ledger: {
				id: crypto.randomUUID(),
				orgId: reservation.orgId,
				meter: reservation.meter,
				quantity: input.quantity,
				creditsDelta: input.creditsDelta,
				actorType: null,
				actorId: reservation.actorId,
				sourceType: input.sourceType,
				sourceId: reservation.id,
				dimensions: null,
				idempotencyKey: `${input.sourceType}:${reservation.id}`,
				periodKey: reservation.periodKey,
			},
		});
	};

	return {
		resolvePolicy,

		overview: async (orgId: string, storageBytes = 0) => {
			const meters = await Promise.all(
				(Object.keys(METERS) as MeterId[]).map(async (meter) => {
					const { policy } = await resolvePolicy(orgId, meter);
					const periodKey = periodKeyFor(meter, now());
					const balance = await dao.readUsageBalance(orgId, meter, periodKey);
					const definition = METERS[meter];
					const used =
						definition.aggregation === "gauge"
							? storageBytes
							: (balance?.consumed ?? 0);
					return {
						meter,
						mode: policy.mode,
						unit: definition.unit,
						included: policy.included,
						used,
						reserved:
							definition.aggregation === "gauge" ? 0 : (balance?.reserved ?? 0),
						creditRate: policy.creditRate,
					};
				}),
			);
			const credits = (await dao.readCreditBalance(orgId)) ?? {
				balance: 0,
				reserved: 0,
			};
			return {
				meters,
				credits: {
					balance: credits.balance,
					reserved: credits.reserved,
					available: credits.balance - credits.reserved,
				},
			};
		},

		authorize: async (input: {
			orgId: string;
			meter: MeterId;
			quantity: number;
			idempotencyKey: string;
			actor?: QuotaActor;
			dimensions?: QuotaDimensions;
		}): Promise<QuotaReservationRow> => {
			const quantity = Math.max(0, Math.trunc(input.quantity));
			const periodKey = periodKeyFor(input.meter, now());
			const { plan, policy } = await resolvePolicy(input.orgId, input.meter);
			await dao.ensureUsageBalance(
				input.orgId,
				input.meter,
				periodKey,
				policy.included,
			);
			await dao.ensureCreditBalance(input.orgId);
			const usage = await dao.readUsageBalance(
				input.orgId,
				input.meter,
				periodKey,
			);
			const credit = await dao.readCreditBalance(input.orgId);
			const draw = planDraw({
				mode: policy.mode,
				included: policy.included,
				creditRate: policy.creditRate,
				consumed: usage?.consumed ?? 0,
				reserved: usage?.reserved ?? 0,
				creditsAvailable: (credit?.balance ?? 0) - (credit?.reserved ?? 0),
				quantity,
			});
			if (!draw.ok) throw aiQuota(plan);
			return hold({
				orgId: input.orgId,
				meter: input.meter,
				periodKey,
				quantity,
				meterHold: draw.meterHold,
				creditsHold: draw.creditsHold,
				idempotencyKey: input.idempotencyKey,
				actor: input.actor,
				dimensions: input.dimensions,
				deny: () => aiQuota(plan),
			});
		},

		/**
		 * Gauge check for storage. Independent mode compares the live stock with
		 * the included bytes. Pooled and hybrid modes reserve credits for the
		 * billable delta; the pending-upload row remains the byte hold.
		 */
		authorizeStorage: async (input: {
			orgId: string;
			currentBytes: number;
			incomingBytes: number;
			idempotencyKey: string;
			actor?: QuotaActor;
		}): Promise<QuotaReservationRow | null> => {
			const { policy } = await resolvePolicy(input.orgId, "storage.bytes");
			const current = Math.max(0, Math.trunc(input.currentBytes));
			const incoming = Math.max(0, Math.trunc(input.incomingBytes));
			const projected = current + incoming;
			if (policy.mode === "independent") {
				if (policy.included >= 0 && projected > policy.included) {
					throw storageQuota();
				}
				return null;
			}
			const credits = Math.max(
				0,
				creditsForQuantity(
					billableBytes(projected, policy),
					policy.creditRate,
				) -
					creditsForQuantity(billableBytes(current, policy), policy.creditRate),
			);
			if (credits <= 0) return null;
			return hold({
				orgId: input.orgId,
				meter: "storage.bytes",
				periodKey: periodKeyFor("storage.bytes", now()),
				quantity: incoming,
				meterHold: 0,
				creditsHold: credits,
				idempotencyKey: input.idempotencyKey,
				actor: input.actor,
				deny: storageQuota,
			});
		},

		settle: async (input: {
			orgId: string;
			idempotencyKey: string;
			actualQuantity: number;
			/** Charge the whole hold. Storage uses this because the hold is a credit delta, not the byte count. */
			consumeAll?: boolean;
			aiUsage?: {
				userId: string;
				inputTokens: number;
				outputTokens: number;
				toolCalls: number;
			};
		}): Promise<void> => {
			const reservation = await dao.findReservationByKey(
				input.orgId,
				input.idempotencyKey,
			);
			if (reservation?.status !== "held") return;
			const { policy } = await resolvePolicy(
				input.orgId,
				reservation.meter as MeterId,
			);
			const split = input.consumeAll
				? {
						actual: reservation.estimated,
						meterUsed: reservation.meterHeld,
						creditsUsed: reservation.creditsHeld,
					}
				: splitActual({
						actual: input.actualQuantity,
						meterHeld: reservation.meterHeld,
						creditsHeld: reservation.creditsHeld,
						creditRate: policy.creditRate,
					});
			const won = await finalize(reservation, {
				status: "settled",
				settled: split.actual,
				meterUsed: split.meterUsed,
				creditsUsed: split.creditsUsed,
				sourceType: "settle",
				quantity: split.actual,
				creditsDelta: -split.creditsUsed,
			});
			// Usage is recorded only when this call won the finalize, so a
			// replayed settle never double-counts.
			if (!won || !input.aiUsage || usageSinks.length === 0) return;
			const usage: QuotaUsageRecord = {
				userId: input.aiUsage.userId,
				inputTokens: input.aiUsage.inputTokens,
				outputTokens: input.aiUsage.outputTokens,
				toolCalls: input.aiUsage.toolCalls,
			};
			for (const sink of usageSinks) {
				await sink(input.orgId, usage);
			}
		},

		release: async (input: {
			orgId: string;
			idempotencyKey: string;
		}): Promise<void> => {
			const reservation = await dao.findReservationByKey(
				input.orgId,
				input.idempotencyKey,
			);
			if (reservation?.status !== "held") return;
			await finalize(reservation, {
				status: "released",
				settled: null,
				meterUsed: 0,
				creditsUsed: 0,
				sourceType: "release",
				quantity: reservation.meterHeld,
				creditsDelta: 0,
			});
		},

		/**
		 * Moves the shared pool when a storage gauge changes outside a hold,
		 * including the refund written when an object is deleted.
		 */
		reconcileGauge: async (input: {
			orgId: string;
			previousBytes: number;
			nextBytes: number;
			sourceId: string;
			actor?: QuotaActor;
		}): Promise<void> => {
			const { policy } = await resolvePolicy(input.orgId, "storage.bytes");
			if (policy.mode === "independent") return;
			const previous = Math.max(0, Math.trunc(input.previousBytes));
			const next = Math.max(0, Math.trunc(input.nextBytes));
			const before = creditsForQuantity(
				billableBytes(previous, policy),
				policy.creditRate,
			);
			const after = creditsForQuantity(
				billableBytes(next, policy),
				policy.creditRate,
			);
			const delta = after - before;
			if (delta === 0) return;
			const idempotencyKey = `gauge:${input.sourceId}:${previous}:${next}`;
			if (await dao.findLedger(input.orgId, idempotencyKey)) return;
			await dao.ensureCreditBalance(input.orgId);
			if (delta > 0) {
				const ok = await dao.tryConsumeCredits(input.orgId, delta);
				if (!ok) throw storageQuota();
			} else {
				await dao.addCredits(input.orgId, -delta);
			}
			await dao.insertLedger({
				id: crypto.randomUUID(),
				orgId: input.orgId,
				meter: "storage.bytes",
				quantity: next - previous,
				creditsDelta: -delta,
				actorType: input.actor?.actorType ?? null,
				actorId: input.actor?.actorId ?? null,
				sourceType: delta > 0 ? "gauge_charge" : "gauge_refund",
				sourceId: input.sourceId,
				dimensions: null,
				idempotencyKey,
				periodKey: periodKeyFor("storage.bytes", now()),
			});
		},

		adjustCredits: async (input: {
			orgId: string;
			amount: number;
			reason: string;
			idempotencyKey: string;
			actor: QuotaActor;
		}) => {
			if (await dao.findLedger(input.orgId, input.idempotencyKey)) {
				return dao.readCreditBalance(input.orgId);
			}
			await dao.ensureCreditBalance(input.orgId);
			const ok = await dao.tryAdjustCredits(input.orgId, input.amount);
			if (!ok) {
				throw new ApiError(
					ApiErrorCode.BILLING_ERROR,
					"Credit balance cannot go below the amount already reserved",
				);
			}
			await dao.insertLedger({
				id: crypto.randomUUID(),
				orgId: input.orgId,
				meter: "credit",
				quantity: input.amount,
				creditsDelta: input.amount,
				actorType: input.actor.actorType,
				actorId: input.actor.actorId ?? null,
				sourceType: "adjustment",
				sourceId: input.reason.slice(0, 200),
				dimensions: { reason: input.reason },
				idempotencyKey: input.idempotencyKey,
				periodKey: null,
			});
			await audit?.record({
				orgId: input.orgId,
				actorType: input.actor.actorType,
				actorId: input.actor.actorId,
				action: "quota.adjusted",
				targetType: "credit_pool",
				targetId: input.orgId,
				after: { amount: input.amount, reason: input.reason },
			});
			return dao.readCreditBalance(input.orgId);
		},

		setPolicy: async (input: {
			orgId: string;
			meter: MeterId;
			policy: MeterPolicy;
			actor: QuotaActor;
		}) => {
			const previous = await dao.findPolicy(input.orgId, input.meter);
			const auditRow = audit?.prepare({
				orgId: input.orgId,
				actorType: input.actor.actorType,
				actorId: input.actor.actorId,
				action: "quota.policy_changed",
				targetType: "quota_policy",
				targetId: input.meter,
				before: previous
					? {
							mode: previous.mode,
							included: previous.included,
							creditRate: previous.creditRate,
						}
					: null,
				after: { ...input.policy },
			});
			await dao.upsertPolicy(
				{
					orgId: input.orgId,
					meter: input.meter,
					mode: input.policy.mode,
					included: input.policy.included,
					creditRate: input.policy.creditRate,
					updatedBy: input.actor.actorId ?? null,
				},
				auditRow,
			);
		},
	};
};

export type QuotaService = ReturnType<typeof createQuotaService>;
