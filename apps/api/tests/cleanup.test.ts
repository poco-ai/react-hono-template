import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemberDao } from "../src/dao/member.dao";
import type { WebhookDeliveryDao } from "../src/dao/webhook-delivery.dao";
import { handleScheduled } from "../src/scheduled";
import {
	ABANDONED_DELIVERY_AGE_MS,
	ABANDONED_DELIVERY_ERROR,
	createCleanupService,
} from "../src/services/cleanup.service";

type InvitationRow = {
	id: string;
	status: string;
	expiresAt: Date | null;
};

type DeliveryRow = {
	id: string;
	status: string;
	attempts: number;
	createdAt: Date;
	lastError: string | null;
	lastAttemptAt: Date | null;
};

test("cleanup deletes expired pending invitations and fails never-attempted stale deliveries", async () => {
	const now = new Date("2026-10-20T12:00:00.000Z");
	const invitations: InvitationRow[] = [
		{
			id: "expired",
			status: "pending",
			expiresAt: new Date(now.getTime() - 1_000),
		},
		{ id: "no-expiry", status: "pending", expiresAt: null },
		{
			id: "future",
			status: "pending",
			expiresAt: new Date(now.getTime() + 60_000),
		},
		{
			id: "accepted",
			status: "accepted",
			expiresAt: new Date(now.getTime() - 60_000),
		},
	];
	const deliveries: DeliveryRow[] = [
		{
			id: "stale",
			status: "pending",
			attempts: 0,
			createdAt: new Date(now.getTime() - ABANDONED_DELIVERY_AGE_MS - 1),
			lastError: null,
			lastAttemptAt: null,
		},
		{
			id: "retrying",
			status: "pending",
			attempts: 1,
			createdAt: new Date(now.getTime() - ABANDONED_DELIVERY_AGE_MS - 1),
			lastError: null,
			lastAttemptAt: null,
		},
		{
			id: "fresh",
			status: "pending",
			attempts: 0,
			createdAt: new Date(now.getTime() - 60_000),
			lastError: null,
			lastAttemptAt: null,
		},
		{
			id: "borderline",
			status: "pending",
			attempts: 0,
			createdAt: new Date(now.getTime() - ABANDONED_DELIVERY_AGE_MS + 1),
			lastError: null,
			lastAttemptAt: null,
		},
	];

	const memberDao = {
		deleteExpiredPending: async (asOf: Date) => {
			const doomed = invitations.filter(
				(row) =>
					row.status === "pending" &&
					row.expiresAt !== null &&
					row.expiresAt.getTime() < asOf.getTime(),
			);
			for (const row of doomed) {
				const index = invitations.findIndex((item) => item.id === row.id);
				invitations.splice(index, 1);
			}
			return doomed.length;
		},
	} as unknown as MemberDao;

	const deliveryDao = {
		failNeverAttempted: async (
			olderThan: Date,
			attemptedAt: Date,
			lastError: string,
		) => {
			let count = 0;
			for (const row of deliveries) {
				if (
					row.status !== "pending" ||
					row.attempts !== 0 ||
					row.createdAt.getTime() >= olderThan.getTime()
				) {
					continue;
				}
				row.status = "failed";
				row.lastError = lastError;
				row.lastAttemptAt = attemptedAt;
				count += 1;
			}
			return count;
		},
	} as unknown as WebhookDeliveryDao;

	const counts = await createCleanupService({
		memberDao,
		deliveryDao,
	}).cleanup(now);

	assert.equal(counts.expiredInvitations, 1);
	assert.equal(counts.failedDeliveries, 1);
	assert.deepEqual(
		invitations.map((row) => row.id),
		["no-expiry", "future", "accepted"],
	);
	const stale = deliveries.find((row) => row.id === "stale");
	assert.equal(stale?.status, "failed");
	assert.equal(stale?.attempts, 0);
	assert.equal(stale?.lastError, ABANDONED_DELIVERY_ERROR);
	assert.equal(stale?.lastError, "delivery timed out");
	assert.equal(stale?.lastAttemptAt?.getTime(), now.getTime());
	assert.equal(
		deliveries.find((row) => row.id === "retrying")?.status,
		"pending",
	);
	assert.equal(deliveries.find((row) => row.id === "retrying")?.attempts, 1);
	assert.equal(deliveries.find((row) => row.id === "fresh")?.status, "pending");
	assert.equal(deliveries.find((row) => row.id === "fresh")?.lastError, null);
	assert.equal(
		deliveries.find((row) => row.id === "borderline")?.status,
		"pending",
	);
});

test("scheduled handler logs cleanup counts and swallows failures", async () => {
	const logs: unknown[][] = [];
	const errors: unknown[][] = [];
	const originalLog = console.log;
	const originalError = console.error;
	console.log = (...args: unknown[]) => {
		logs.push(args);
	};
	console.error = (...args: unknown[]) => {
		errors.push(args);
	};
	try {
		await handleScheduled({
			cleanup: async () => ({ expiredInvitations: 2, failedDeliveries: 1 }),
		});
		assert.ok(
			logs.some(
				(args) =>
					args[0] === "[cron] cleanup expiredInvitations=2 failedDeliveries=1",
			),
		);
		await handleScheduled({
			cleanup: async () => {
				throw new Error("db down");
			},
		});
		const failure = errors.find((args) => args[0] === "[cron] cleanup failed:");
		assert.ok(failure);
		assert.equal((failure[1] as Error).message, "db down");
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
});
