import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	PLANS,
	redactAuditValue,
} from "@workspace/shared";
import { createAuditDao } from "../src/dao/audit.dao";
import { createQuotaDao } from "../src/dao/quota.dao";
import { createAuditService } from "../src/services/audit.service";
import { createQuotaService } from "../src/services/quota.service";
import { createTestDb } from "./helpers/test-db";

const NOW = new Date("2026-11-15T00:00:00.000Z");
const PERIOD = "2026-11";

const setup = (plan: "free" | "pro" = "free") => {
	const { sqlite, db } = createTestDb();
	const audit = createAuditService(createAuditDao(db));
	const quota = createQuotaService({
		dao: createQuotaDao(db),
		plans: { getPlanForOrg: async () => plan },
		audit,
		now: () => NOW,
	});
	return { sqlite, db, audit, quota };
};

const balance = (
	sqlite: ReturnType<typeof createTestDb>["sqlite"],
	orgId: string,
) =>
	sqlite
		.query(
			`SELECT granted, consumed, reserved FROM usage_balances
			 WHERE org_id = ? AND meter = 'ai.tokens' AND period_key = ?`,
		)
		.get(orgId, PERIOD) as {
		granted: number;
		consumed: number;
		reserved: number;
	} | null;

test("default independent meters match the current plan numbers", async () => {
	const { quota } = setup("free");
	const overview = await quota.overview("org-free");
	const ai = overview.meters.find((meter) => meter.meter === "ai.tokens");
	const storage = overview.meters.find(
		(meter) => meter.meter === "storage.bytes",
	);
	assert.equal(ai?.included, PLANS.free.aiMonthlyTokens);
	assert.equal(ai?.mode, "independent");
	assert.equal(storage?.included, PLANS.free.storageBytes);
	assert.equal(storage?.mode, "independent");

	await assert.rejects(
		() =>
			quota.authorize({
				orgId: "org-free",
				meter: "ai.tokens",
				quantity: PLANS.free.aiMonthlyTokens + 1,
				idempotencyKey: "ai:over",
			}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.AI_QUOTA_EXCEEDED,
	);
	await assert.rejects(
		() =>
			quota.authorizeStorage({
				orgId: "org-free",
				currentBytes: PLANS.free.storageBytes,
				incomingBytes: 1,
				idempotencyKey: "storage:over",
			}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
	);
	assert.equal(
		await quota.authorizeStorage({
			orgId: "org-free",
			currentBytes: 0,
			incomingBytes: 10,
			idempotencyKey: "storage:ok",
		}),
		null,
	);
});

test("seeded monthly usage is kept and included room still authorizes", async () => {
	const { sqlite, quota } = setup();
	await quota.setPolicy({
		orgId: "org-seed",
		meter: "ai.tokens",
		policy: { mode: "independent", included: 50, creditRate: 1000 },
		actor: { actorType: "user", actorId: "admin" },
	});
	sqlite.run(
		`INSERT INTO usage_balances (org_id, meter, period_key, granted, consumed, reserved)
		 VALUES ('org-seed', 'ai.tokens', ?, 0, 40, 0)`,
		PERIOD,
	);
	await quota.authorize({
		orgId: "org-seed",
		meter: "ai.tokens",
		quantity: 10,
		idempotencyKey: "ai:seed",
	});
	const row = balance(sqlite, "org-seed");
	assert.equal(row?.granted, 50);
	assert.equal(row?.consumed, 40);
	assert.equal(row?.reserved, 10);
});

test("hybrid draws the pool after included quantity, then denies", async () => {
	const { quota } = setup();
	await quota.setPolicy({
		orgId: "org-hybrid",
		meter: "ai.tokens",
		policy: { mode: "hybrid", included: 100, creditRate: 1000 },
		actor: { actorType: "user", actorId: "admin" },
	});
	await quota.adjustCredits({
		orgId: "org-hybrid",
		amount: 10,
		reason: "contract",
		idempotencyKey: "grant-hybrid",
		actor: { actorType: "user", actorId: "admin" },
	});
	await quota.authorize({
		orgId: "org-hybrid",
		meter: "ai.tokens",
		quantity: 2100,
		idempotencyKey: "ai:hybrid-1",
	});
	await quota.settle({
		orgId: "org-hybrid",
		idempotencyKey: "ai:hybrid-1",
		actualQuantity: 2100,
	});
	await assert.rejects(
		() =>
			quota.authorize({
				orgId: "org-hybrid",
				meter: "ai.tokens",
				quantity: 9000,
				idempotencyKey: "ai:hybrid-2",
			}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.AI_QUOTA_EXCEEDED,
	);
});

test("pooled usage spends credits and ignores the included cap", async () => {
	const { sqlite, quota } = setup();
	await quota.setPolicy({
		orgId: "org-pool",
		meter: "ai.tokens",
		policy: { mode: "pooled", included: 1, creditRate: 1000 },
		actor: { actorType: "system" },
	});
	await quota.adjustCredits({
		orgId: "org-pool",
		amount: 5,
		reason: "grant",
		idempotencyKey: "grant-pool",
		actor: { actorType: "system" },
	});
	await quota.authorize({
		orgId: "org-pool",
		meter: "ai.tokens",
		quantity: 5000,
		idempotencyKey: "ai:pool",
	});
	const credits = sqlite
		.query("SELECT balance, reserved FROM credit_balances WHERE org_id = ?")
		.get("org-pool") as { balance: number; reserved: number } | null;
	assert.equal(credits?.balance, 5);
	assert.equal(credits?.reserved, 5);
	await assert.rejects(
		() =>
			quota.authorize({
				orgId: "org-pool",
				meter: "ai.tokens",
				quantity: 1000,
				idempotencyKey: "ai:pool-2",
			}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.AI_QUOTA_EXCEEDED,
	);
});

test("settle is idempotent and release returns the hold", async () => {
	const { sqlite, quota } = setup();
	await quota.authorize({
		orgId: "org-settle",
		meter: "ai.tokens",
		quantity: 100,
		idempotencyKey: "ai:once",
	});
	await quota.settle({
		orgId: "org-settle",
		idempotencyKey: "ai:once",
		actualQuantity: 40,
	});
	await quota.settle({
		orgId: "org-settle",
		idempotencyKey: "ai:once",
		actualQuantity: 40,
	});
	const settled = balance(sqlite, "org-settle");
	assert.equal(settled?.consumed, 40);
	assert.equal(settled?.reserved, 0);
	const ledger = sqlite
		.query(
			"SELECT count(*) AS total FROM usage_ledger WHERE org_id = ? AND source_type = 'settle'",
		)
		.get("org-settle") as { total: number } | null;
	assert.equal(ledger?.total, 1);

	await quota.authorize({
		orgId: "org-release",
		meter: "ai.tokens",
		quantity: 25,
		idempotencyKey: "ai:release",
	});
	await quota.release({ orgId: "org-release", idempotencyKey: "ai:release" });
	const released = balance(sqlite, "org-release");
	assert.equal(released?.reserved, 0);
	assert.equal(released?.consumed, 0);
});

test("concurrent authorizations cannot reserve more than the included amount", async () => {
	const { sqlite, quota } = setup();
	await quota.setPolicy({
		orgId: "org-race",
		meter: "ai.tokens",
		policy: { mode: "independent", included: 100, creditRate: 1000 },
		actor: { actorType: "system" },
	});
	const results = await Promise.allSettled([
		quota.authorize({
			orgId: "org-race",
			meter: "ai.tokens",
			quantity: 80,
			idempotencyKey: "ai:race-a",
		}),
		quota.authorize({
			orgId: "org-race",
			meter: "ai.tokens",
			quantity: 80,
			idempotencyKey: "ai:race-b",
		}),
	]);
	assert.equal(
		results.filter((result) => result.status === "fulfilled").length,
		1,
	);
	const row = balance(sqlite, "org-race");
	assert.ok(row);
	assert.ok(row.reserved + row.consumed <= row.granted);
	assert.ok(row.reserved >= 0);
	assert.ok(row.consumed >= 0);
});

test("audit redacts secrets and does not keep prompt or key material", async () => {
	const { audit } = setup();
	await audit.record({
		orgId: "org-audit",
		actorType: "user",
		actorId: "user-1",
		action: "apikey.created",
		targetType: "api_key",
		targetId: "key-1",
		after: {
			name: "ci",
			secret: "sk_live_super_secret",
			note: "prefix sk_test_should_go",
		},
	});
	const page = await audit.list({
		orgId: "org-audit",
		page: 1,
		pageSize: 10,
	});
	const serialized = JSON.stringify(page.items);
	assert.equal(serialized.includes("sk_live_super_secret"), false);
	assert.equal(serialized.includes("sk_test_should_go"), false);
	assert.equal(page.items[0]?.after?.name, "ci");
	assert.deepEqual(redactAuditValue({ token: "abc", prompt: "hello" }), {
		token: "[redacted]",
		prompt: "[redacted]",
	});
});
