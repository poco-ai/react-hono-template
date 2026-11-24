import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Quota policy, balances, ledger and reservations. */
export const defineBillingTables = (kit: SchemaKit) => {
	const {
		sqliteTable,
		text,
		integer,
		index,
		uniqueIndex,
		primaryKey,
		timestampDefault,
	} = kit;

	/**
	 * Sparse org override of a meter's price card. Missing rows use the plan
	 * catalog in `@workspace/shared`.
	 */
	const quotaPolicies = sqliteTable(
		"quota_policies",
		{
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			mode: text("mode").notNull(),
			included: integer("included").notNull(),
			creditRate: integer("credit_rate").notNull(),
			updatedBy: text("updated_by").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			primaryKey({ columns: [table.orgId, table.meter] }),
			index("quotaPolicies_orgId_idx").on(table.orgId),
		],
	);

	/** Included-balance counter for one meter and period. */
	const usageBalances = sqliteTable(
		"usage_balances",
		{
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			periodKey: text("period_key").notNull(),
			granted: integer("granted").notNull().default(0),
			consumed: integer("consumed").notNull().default(0),
			reserved: integer("reserved").notNull().default(0),
		},
		(table) => [
			primaryKey({
				columns: [table.orgId, table.meter, table.periodKey],
			}),
		],
	);

	/** Shared credit pool. Grants do not reset with the calendar month. */
	const creditBalances = sqliteTable("credit_balances", {
		orgId: text("org_id")
			.primaryKey()
			.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
		balance: integer("balance").notNull().default(0),
		reserved: integer("reserved").notNull().default(0),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	});

	const usageLedger = sqliteTable(
		"usage_ledger",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			quantity: integer("quantity").notNull(),
			creditsDelta: integer("credits_delta").notNull().default(0),
			actorType: text("actor_type"),
			actorId: text("actor_id"),
			sourceType: text("source_type").notNull(),
			sourceId: text("source_id"),
			dimensions: text("dimensions", { mode: "json" }).$type<
				Record<string, unknown>
			>(),
			idempotencyKey: text("idempotency_key").notNull(),
			periodKey: text("period_key"),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("usageLedger_orgId_idempotencyKey_uq").on(
				table.orgId,
				table.idempotencyKey,
			),
			index("usageLedger_orgId_createdAt_idx").on(
				table.orgId,
				sql`${table.createdAt} desc`,
			),
		],
	);

	const quotaReservations = sqliteTable(
		"quota_reservations",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			periodKey: text("period_key").notNull(),
			estimated: integer("estimated").notNull(),
			settled: integer("settled"),
			meterHeld: integer("meter_held").notNull().default(0),
			creditsHeld: integer("credits_held").notNull().default(0),
			status: text("status").notNull().default("held"),
			idempotencyKey: text("idempotency_key").notNull(),
			/** Set when a settle/release batch wins, so the rest of that batch can match it. */
			settleToken: text("settle_token"),
			actorId: text("actor_id"),
			dimensions: text("dimensions", { mode: "json" }).$type<
				Record<string, unknown>
			>(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("quotaReservations_orgId_idempotencyKey_uq").on(
				table.orgId,
				table.idempotencyKey,
			),
			index("quotaReservations_orgId_status_idx").on(table.orgId, table.status),
		],
	);

	return {
		quotaPolicies,
		usageBalances,
		creditBalances,
		usageLedger,
		quotaReservations,
	};
};
