import assert from "node:assert/strict";
import { test } from "node:test";
import type { MediaAssetDao } from "../src/dao/media-asset.dao";
import type { MemberDao } from "../src/dao/member.dao";
import type { PendingUploadDao } from "../src/dao/pending-upload.dao";
import type { WebhookDeliveryDao } from "../src/dao/webhook-delivery.dao";
import type { BackgroundFn } from "../src/lib/background";
import type { StorageAdapter } from "../src/lib/storage/types";
import { handleScheduled } from "../src/scheduled";
import {
	ABANDONED_DELIVERY_AGE_MS,
	ABANDONED_DELIVERY_ERROR,
	createCleanupService,
	NOTIFICATION_CLEANUP_LIMIT,
	READ_NOTIFICATION_TTL_MS,
	UNREAD_NOTIFICATION_TTL_MS,
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

const recurrencesStub = {
	processDue: async () => ({ created: 0, skipped: 0, failed: 0 }),
};

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
		await handleScheduled(
			{
				cleanup: async () => ({
					expiredInvitations: 2,
					failedDeliveries: 1,
					deletedConversations: 3,
					deletedNotifications: 6,
					expiredPendingUploads: 4,
					supersededMedia: 5,
				}),
			},
			recurrencesStub,
		);
		assert.ok(
			logs.some(
				(args) =>
					args[0] ===
					"[cron] cleanup expiredInvitations=2 failedDeliveries=1 deletedConversations=3 deletedNotifications=6 expiredPendingUploads=4 supersededMedia=5",
			),
		);
		await handleScheduled(
			{
				cleanup: async () => {
					throw new Error("db down");
				},
			},
			recurrencesStub,
		);
		const failure = errors.find((args) => args[0] === "[cron] cleanup failed:");
		assert.ok(failure);
		assert.equal((failure[1] as Error).message, "db down");
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
});

test("scheduled handler forwards the background runner to recurrences", async () => {
	const background: BackgroundFn = () => {};
	let received: BackgroundFn | undefined;
	await handleScheduled(
		{
			cleanup: async () => ({
				expiredInvitations: 0,
				failedDeliveries: 0,
				deletedConversations: 0,
				deletedNotifications: 0,
				expiredPendingUploads: 0,
				supersededMedia: 0,
			}),
		},
		{
			processDue: async (_at?: Date, runner?: BackgroundFn) => {
				received = runner;
				return { created: 0, skipped: 0, failed: 0 };
			},
		},
		background,
	);
	assert.equal(received, background);
});

test("cleanup applies 30/90-day notification retention in bounded batches", async () => {
	const now = new Date("2026-10-20T12:00:00.000Z");
	const day = 24 * 60 * 60 * 1000;
	let received:
		| { readBefore: Date; unreadBefore: Date; limit: number }
		| undefined;
	const counts = await createCleanupService({
		memberDao: {
			deleteExpiredPending: async () => 0,
		} as unknown as MemberDao,
		deliveryDao: {
			failNeverAttempted: async () => 0,
		} as unknown as WebhookDeliveryDao,
		notificationDao: {
			deleteOlderThan: async (args) => {
				received = args;
				return 7;
			},
		},
	}).cleanup(now);

	assert.equal(READ_NOTIFICATION_TTL_MS, 30 * day);
	assert.equal(UNREAD_NOTIFICATION_TTL_MS, 90 * day);
	assert.equal(NOTIFICATION_CLEANUP_LIMIT, 500);
	assert.equal(counts.deletedNotifications, 7);
	assert.equal(received?.readBefore.getTime(), now.getTime() - 30 * day);
	assert.equal(received?.unreadBefore.getTime(), now.getTime() - 90 * day);
	assert.equal(received?.limit, NOTIFICATION_CLEANUP_LIMIT);
});

test("cleanup removes expired pending objects but keeps registered ones", async () => {
	const now = new Date("2026-10-20T12:00:00.000Z");
	const rows = [
		{
			key: "old-key",
			expiresAt: new Date(now.getTime() - 1_000),
		},
		{
			key: "registered-key",
			expiresAt: new Date(now.getTime() - 1_000),
		},
		{
			key: "fresh-key",
			expiresAt: new Date(now.getTime() + 60_000),
		},
	];
	const removed: string[] = [];
	const counts = await createCleanupService({
		memberDao: {
			deleteExpiredPending: async () => 0,
		} as unknown as MemberDao,
		deliveryDao: {
			failNeverAttempted: async () => 0,
		} as unknown as WebhookDeliveryDao,
		pendingUploadDao: {
			findExpired: async (asOf: Date) =>
				rows.filter((row) => row.expiresAt.getTime() < asOf.getTime()),
			deleteByKeyIfExpired: async (key: string, asOf: Date) => {
				const index = rows.findIndex(
					(row) => row.key === key && row.expiresAt.getTime() < asOf.getTime(),
				);
				if (index < 0) return false;
				rows.splice(index, 1);
				return true;
			},
		} as unknown as Pick<
			PendingUploadDao,
			"findExpired" | "deleteByKeyIfExpired"
		>,
		attachmentDao: {
			existsByKey: async (key: string) => key === "registered-key",
		} as unknown as { existsByKey: (key: string) => Promise<boolean> },
		mediaAssetDao: {
			findSupersededBefore: async () => [],
			deleteById: async () => {},
			existsByKey: async () => false,
		} as unknown as Pick<
			MediaAssetDao,
			"findSupersededBefore" | "deleteById" | "existsByKey"
		>,
		storage: {
			remove: async (key: string) => {
				removed.push(key);
			},
		} as StorageAdapter,
	}).cleanup(now);

	assert.equal(counts.expiredPendingUploads, 2);
	assert.equal(counts.supersededMedia, 0);
	assert.deepEqual(removed, ["old-key"]);
	assert.deepEqual(
		rows.map((row) => row.key),
		["fresh-key"],
	);
});

test("superseded avatars and logos are deleted after the one-day grace period", async () => {
	const now = new Date("2026-06-01T00:00:00.000Z");
	const day = 24 * 60 * 60 * 1000;
	const assets = [
		{
			id: "old",
			key: "old-logo",
			supersededAt: new Date(now.getTime() - day - 1000),
		},
		{
			id: "fresh",
			key: "fresh-logo",
			supersededAt: new Date(now.getTime() - 60 * 60 * 1000),
		},
	];
	const removed: string[] = [];
	const counts = await createCleanupService({
		memberDao: {
			deleteExpiredPending: async () => 0,
		} as unknown as MemberDao,
		deliveryDao: {
			failNeverAttempted: async () => 0,
		} as unknown as WebhookDeliveryDao,
		mediaAssetDao: {
			findSupersededBefore: async (before: Date) =>
				assets.filter(
					(asset) => asset.supersededAt.getTime() < before.getTime(),
				),
			deleteById: async (id: string) => {
				const index = assets.findIndex((asset) => asset.id === id);
				if (index >= 0) assets.splice(index, 1);
			},
			existsByKey: async () => false,
		} as unknown as Pick<
			MediaAssetDao,
			"findSupersededBefore" | "deleteById" | "existsByKey"
		>,
		storage: {
			remove: async (key: string) => {
				removed.push(key);
			},
		} as StorageAdapter,
	}).cleanup(now);

	assert.equal(counts.supersededMedia, 1);
	assert.deepEqual(removed, ["old-logo"]);
	assert.deepEqual(
		assets.map((asset) => asset.id),
		["fresh"],
	);
});
