CREATE TABLE "quota_policies" (
	"org_id" text NOT NULL,
	"meter" text NOT NULL,
	"mode" text NOT NULL,
	"included" integer NOT NULL,
	"credit_rate" integer NOT NULL,
	"updated_by" text,
	"updated_at" bigint DEFAULT (cast(extract(epoch from now()) * 1000 as bigint)) NOT NULL,
	CONSTRAINT "quota_policies_pkey" PRIMARY KEY("org_id","meter")
);
--> statement-breakpoint
CREATE INDEX "quotaPolicies_orgId_idx" ON "quota_policies" ("org_id");
--> statement-breakpoint
CREATE TABLE "usage_balances" (
	"org_id" text NOT NULL,
	"meter" text NOT NULL,
	"period_key" text NOT NULL,
	"granted" integer DEFAULT 0 NOT NULL,
	"consumed" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_balances_pkey" PRIMARY KEY("org_id","meter","period_key")
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"org_id" text PRIMARY KEY,
	"balance" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT (cast(extract(epoch from now()) * 1000 as bigint)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" text PRIMARY KEY,
	"org_id" text NOT NULL,
	"meter" text NOT NULL,
	"quantity" integer NOT NULL,
	"credits_delta" integer DEFAULT 0 NOT NULL,
	"actor_type" text,
	"actor_id" text,
	"source_type" text NOT NULL,
	"source_id" text,
	"dimensions" text,
	"idempotency_key" text NOT NULL,
	"period_key" text,
	"created_at" bigint DEFAULT (cast(extract(epoch from now()) * 1000 as bigint)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "usageLedger_orgId_idempotencyKey_uq" ON "usage_ledger" ("org_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "usageLedger_orgId_createdAt_idx" ON "usage_ledger" ("org_id","created_at" DESC);
--> statement-breakpoint
CREATE TABLE "quota_reservations" (
	"id" text PRIMARY KEY,
	"org_id" text NOT NULL,
	"meter" text NOT NULL,
	"period_key" text NOT NULL,
	"estimated" integer NOT NULL,
	"settled" integer,
	"meter_held" integer DEFAULT 0 NOT NULL,
	"credits_held" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"idempotency_key" text NOT NULL,
	"settle_token" text,
	"actor_id" text,
	"dimensions" text,
	"created_at" bigint DEFAULT (cast(extract(epoch from now()) * 1000 as bigint)) NOT NULL,
	"updated_at" bigint DEFAULT (cast(extract(epoch from now()) * 1000 as bigint)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "quotaReservations_orgId_idempotencyKey_uq" ON "quota_reservations" ("org_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "quotaReservations_orgId_status_idx" ON "quota_reservations" ("org_id","status");
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY,
	"org_id" text,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"result" text DEFAULT 'success' NOT NULL,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"before" text,
	"after" text,
	"created_at" bigint DEFAULT (cast(extract(epoch from now()) * 1000 as bigint)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auditEvents_orgId_createdAt_idx" ON "audit_events" ("org_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "auditEvents_orgId_action_createdAt_idx" ON "audit_events" ("org_id","action","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "auditEvents_actorId_createdAt_idx" ON "audit_events" ("actor_id","created_at" DESC);
--> statement-breakpoint
INSERT INTO "usage_balances" ("org_id", "meter", "period_key", "granted", "consumed", "reserved")
SELECT "org_id", 'ai.tokens', substr("day", 1, 7), 0, sum("input_tokens" + "output_tokens"), 0
FROM "ai_usage_daily"
WHERE substr("day", 1, 7) = to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM')
GROUP BY "org_id", substr("day", 1, 7);
