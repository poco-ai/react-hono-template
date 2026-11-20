import { and, eq, sql } from "drizzle-orm";
import { runBatch } from "../db/run-batch";
import {
	auditEvents,
	creditBalances,
	quotaPolicies,
	quotaReservations,
	usageBalances,
	usageLedger,
} from "../db/schema";
import type { Database } from "../db/types";
import { sqlNow } from "../lib/sql-dialect";
import type { AuditEventInsert } from "./audit.dao";

export type UsageBalanceRow = {
	granted: number;
	consumed: number;
	reserved: number;
};

export type CreditBalanceRow = {
	balance: number;
	reserved: number;
};

export type ReservationStatus = "held" | "settled" | "released";

export type QuotaReservationRow = {
	id: string;
	orgId: string;
	meter: string;
	periodKey: string;
	estimated: number;
	settled: number | null;
	meterHeld: number;
	creditsHeld: number;
	status: ReservationStatus;
	idempotencyKey: string;
	settleToken: string | null;
	actorId: string | null;
};

export type QuotaPolicyRow = {
	orgId: string;
	meter: string;
	mode: string;
	included: number;
	creditRate: number;
};

const reservationFrom = (
	row: typeof quotaReservations.$inferSelect,
): QuotaReservationRow => ({
	id: row.id,
	orgId: row.orgId,
	meter: row.meter,
	periodKey: row.periodKey,
	estimated: row.estimated,
	settled: row.settled,
	meterHeld: row.meterHeld,
	creditsHeld: row.creditsHeld,
	status: row.status as ReservationStatus,
	idempotencyKey: row.idempotencyKey,
	settleToken: row.settleToken,
	actorId: row.actorId,
});

const tokenMatches = (reservationId: string, token: string) =>
	sql`(SELECT settle_token FROM quota_reservations WHERE id = ${reservationId}) = ${token}`;

export type LedgerInsert = {
	id: string;
	orgId: string;
	meter: string;
	quantity: number;
	creditsDelta: number;
	actorType: string | null;
	actorId: string | null;
	sourceType: string;
	sourceId: string | null;
	dimensions: Record<string, unknown> | null;
	idempotencyKey: string;
	periodKey: string | null;
};

export type ReservationInsert = {
	id: string;
	orgId: string;
	meter: string;
	periodKey: string;
	estimated: number;
	meterHeld: number;
	creditsHeld: number;
	idempotencyKey: string;
	actorId: string | null;
	dimensions: Record<string, unknown> | null;
};

export const createQuotaDao = (db: Database) => {
	const findReservationByKey = async (
		orgId: string,
		idempotencyKey: string,
	): Promise<QuotaReservationRow | null> => {
		const [row] = await db
			.select()
			.from(quotaReservations)
			.where(
				and(
					eq(quotaReservations.orgId, orgId),
					eq(quotaReservations.idempotencyKey, idempotencyKey),
				),
			)
			.limit(1);
		return row ? reservationFrom(row) : null;
	};

	const findReservationById = async (
		id: string,
	): Promise<QuotaReservationRow | null> => {
		const [row] = await db
			.select()
			.from(quotaReservations)
			.where(eq(quotaReservations.id, id))
			.limit(1);
		return row ? reservationFrom(row) : null;
	};

	return {
		findPolicy: async (
			orgId: string,
			meter: string,
		): Promise<QuotaPolicyRow | null> => {
			const [row] = await db
				.select({
					orgId: quotaPolicies.orgId,
					meter: quotaPolicies.meter,
					mode: quotaPolicies.mode,
					included: quotaPolicies.included,
					creditRate: quotaPolicies.creditRate,
				})
				.from(quotaPolicies)
				.where(
					and(eq(quotaPolicies.orgId, orgId), eq(quotaPolicies.meter, meter)),
				)
				.limit(1);
			return row ?? null;
		},

		upsertPolicy: async (
			row: QuotaPolicyRow & { updatedBy: string | null },
			audit?: AuditEventInsert,
		): Promise<void> => {
			const write = (tx: Database) =>
				tx
					.insert(quotaPolicies)
					.values({
						orgId: row.orgId,
						meter: row.meter,
						mode: row.mode,
						included: row.included,
						creditRate: row.creditRate,
						updatedBy: row.updatedBy,
					})
					.onConflictDoUpdate({
						target: [quotaPolicies.orgId, quotaPolicies.meter],
						set: {
							mode: row.mode,
							included: row.included,
							creditRate: row.creditRate,
							updatedBy: row.updatedBy,
							updatedAt: new Date(),
						},
					});
			if (!audit) {
				await write(db);
				return;
			}
			await runBatch(db, (tx) => [
				write(tx),
				tx.insert(usageLedger).values({
					id: crypto.randomUUID(),
					orgId: row.orgId,
					meter: row.meter,
					quantity: 0,
					creditsDelta: 0,
					actorType: audit.actorType,
					actorId: audit.actorId,
					sourceType: "policy",
					sourceId: row.meter,
					dimensions: { mode: row.mode, included: row.included },
					idempotencyKey: `policy:${audit.id}`,
					periodKey: null,
				}),
				tx.insert(auditEvents).values(audit),
			]);
		},

		ensureUsageBalance: async (
			orgId: string,
			meter: string,
			periodKey: string,
			granted: number,
		): Promise<void> => {
			await db
				.insert(usageBalances)
				.values({ orgId, meter, periodKey, granted, consumed: 0, reserved: 0 })
				.onConflictDoUpdate({
					target: [
						usageBalances.orgId,
						usageBalances.meter,
						usageBalances.periodKey,
					],
					set: { granted },
				});
		},

		readUsageBalance: async (
			orgId: string,
			meter: string,
			periodKey: string,
		): Promise<UsageBalanceRow | null> => {
			const [row] = await db
				.select({
					granted: usageBalances.granted,
					consumed: usageBalances.consumed,
					reserved: usageBalances.reserved,
				})
				.from(usageBalances)
				.where(
					and(
						eq(usageBalances.orgId, orgId),
						eq(usageBalances.meter, meter),
						eq(usageBalances.periodKey, periodKey),
					),
				)
				.limit(1);
			return row ?? null;
		},

		ensureCreditBalance: async (orgId: string): Promise<void> => {
			await db
				.insert(creditBalances)
				.values({ orgId, balance: 0, reserved: 0 })
				.onConflictDoNothing();
		},

		readCreditBalance: async (
			orgId: string,
		): Promise<CreditBalanceRow | null> => {
			const [row] = await db
				.select({
					balance: creditBalances.balance,
					reserved: creditBalances.reserved,
				})
				.from(creditBalances)
				.where(eq(creditBalances.orgId, orgId))
				.limit(1);
			return row ?? null;
		},

		tryAddMeterReserved: async (
			orgId: string,
			meter: string,
			periodKey: string,
			amount: number,
		): Promise<boolean> => {
			if (amount <= 0) return true;
			const rows = await db
				.update(usageBalances)
				.set({
					reserved: sql`${usageBalances.reserved} + ${amount}`,
				})
				.where(
					and(
						eq(usageBalances.orgId, orgId),
						eq(usageBalances.meter, meter),
						eq(usageBalances.periodKey, periodKey),
						sql`(${usageBalances.granted} < 0 OR ${usageBalances.consumed} + ${usageBalances.reserved} + ${amount} <= ${usageBalances.granted})`,
					),
				)
				.returning({ orgId: usageBalances.orgId });
			return rows.length > 0;
		},

		releaseMeterReserved: async (
			orgId: string,
			meter: string,
			periodKey: string,
			amount: number,
		): Promise<void> => {
			if (amount <= 0) return;
			await db
				.update(usageBalances)
				.set({ reserved: sql`${usageBalances.reserved} - ${amount}` })
				.where(
					and(
						eq(usageBalances.orgId, orgId),
						eq(usageBalances.meter, meter),
						eq(usageBalances.periodKey, periodKey),
						sql`${usageBalances.reserved} >= ${amount}`,
					),
				);
		},

		tryAddCreditReserved: async (
			orgId: string,
			amount: number,
		): Promise<boolean> => {
			if (amount <= 0) return true;
			const rows = await db
				.update(creditBalances)
				.set({ reserved: sql`${creditBalances.reserved} + ${amount}` })
				.where(
					and(
						eq(creditBalances.orgId, orgId),
						sql`${creditBalances.balance} - ${creditBalances.reserved} >= ${amount}`,
					),
				)
				.returning({ orgId: creditBalances.orgId });
			return rows.length > 0;
		},

		releaseCreditReserved: async (
			orgId: string,
			amount: number,
		): Promise<void> => {
			if (amount <= 0) return;
			await db
				.update(creditBalances)
				.set({ reserved: sql`${creditBalances.reserved} - ${amount}` })
				.where(
					and(
						eq(creditBalances.orgId, orgId),
						sql`${creditBalances.reserved} >= ${amount}`,
					),
				);
		},

		tryConsumeCredits: async (
			orgId: string,
			amount: number,
		): Promise<boolean> => {
			if (amount <= 0) return true;
			const rows = await db
				.update(creditBalances)
				.set({
					balance: sql`${creditBalances.balance} - ${amount}`,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(creditBalances.orgId, orgId),
						sql`${creditBalances.balance} - ${creditBalances.reserved} >= ${amount}`,
					),
				)
				.returning({ orgId: creditBalances.orgId });
			return rows.length > 0;
		},

		addCredits: async (orgId: string, amount: number): Promise<void> => {
			if (amount === 0) return;
			await db
				.update(creditBalances)
				.set({
					balance: sql`${creditBalances.balance} + ${amount}`,
					updatedAt: new Date(),
				})
				.where(eq(creditBalances.orgId, orgId));
		},

		/**
		 * Applies a signed credit change when the result stays at or above the
		 * reserved amount. Returns false when the balance would go too low.
		 */
		tryAdjustCredits: async (
			orgId: string,
			amount: number,
		): Promise<boolean> => {
			const rows = await db
				.update(creditBalances)
				.set({
					balance: sql`${creditBalances.balance} + ${amount}`,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(creditBalances.orgId, orgId),
						sql`${creditBalances.balance} + ${amount} >= ${creditBalances.reserved}`,
					),
				)
				.returning({ orgId: creditBalances.orgId });
			return rows.length > 0;
		},

		findReservationByKey,
		findReservationById,

		insertReservation: async (row: ReservationInsert): Promise<void> => {
			await db.insert(quotaReservations).values({
				...row,
				status: "held",
			});
		},

		findLedger: async (
			orgId: string,
			idempotencyKey: string,
		): Promise<boolean> => {
			const [row] = await db
				.select({ id: usageLedger.id })
				.from(usageLedger)
				.where(
					and(
						eq(usageLedger.orgId, orgId),
						eq(usageLedger.idempotencyKey, idempotencyKey),
					),
				)
				.limit(1);
			return Boolean(row);
		},

		insertLedger: async (row: LedgerInsert): Promise<void> => {
			await db.insert(usageLedger).values(row);
		},

		/**
		 * One batch: the status flip sets a token, and every following statement
		 * matches that token. A losing concurrent settle changes nothing.
		 */
		finalizeReservation: async (input: {
			reservationId: string;
			orgId: string;
			meter: string;
			periodKey: string;
			status: "settled" | "released";
			settled: number | null;
			meterHeld: number;
			meterUsed: number;
			creditsHeld: number;
			creditsUsed: number;
			ledger: LedgerInsert;
		}): Promise<boolean> => {
			const token = crypto.randomUUID();
			await runBatch(db, (tx) => [
				tx
					.update(quotaReservations)
					.set({
						status: input.status,
						settled: input.settled,
						settleToken: token,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(quotaReservations.id, input.reservationId),
							eq(quotaReservations.status, "held"),
						),
					),
				tx
					.update(usageBalances)
					.set({
						reserved: sql`${usageBalances.reserved} - ${input.meterHeld}`,
						consumed: sql`${usageBalances.consumed} + ${input.meterUsed}`,
					})
					.where(
						and(
							eq(usageBalances.orgId, input.orgId),
							eq(usageBalances.meter, input.meter),
							eq(usageBalances.periodKey, input.periodKey),
							sql`${usageBalances.reserved} >= ${input.meterHeld}`,
							tokenMatches(input.reservationId, token),
						),
					),
				tx
					.update(creditBalances)
					.set({
						reserved: sql`${creditBalances.reserved} - ${input.creditsHeld}`,
						balance: sql`${creditBalances.balance} - ${input.creditsUsed}`,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(creditBalances.orgId, input.orgId),
							sql`${creditBalances.reserved} >= ${input.creditsHeld}`,
							sql`${creditBalances.balance} >= ${input.creditsUsed}`,
							tokenMatches(input.reservationId, token),
						),
					),
				tx.insert(usageLedger).select(sql`
					SELECT ${input.ledger.id}, ${input.ledger.orgId}, ${input.ledger.meter},
						${input.ledger.quantity}, ${input.ledger.creditsDelta},
						${input.ledger.actorType}, ${input.ledger.actorId},
						${input.ledger.sourceType}, ${input.ledger.sourceId},
						${input.ledger.dimensions ? JSON.stringify(input.ledger.dimensions) : null},
						${input.ledger.idempotencyKey}, ${input.ledger.periodKey},
						${sqlNow()}
					WHERE ${tokenMatches(input.reservationId, token)}
				`),
			]);
			const row = await findReservationById(input.reservationId);
			return row?.settleToken === token;
		},
	};
};

export type QuotaDao = ReturnType<typeof createQuotaDao>;
