import type { IssueSubscriptionReason } from "@workspace/shared";
import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { issueSubscriptions } from "../db/schema";
import type { Database } from "../db/types";

export type IssueSubscriber = {
	userId: string;
	reason: string;
	muted: boolean;
};

export type IssueSubscriptionRow = IssueSubscriber & {
	issueId: string;
	orgId: string;
};

const toRow = (
	row: typeof issueSubscriptions.$inferSelect,
): IssueSubscriptionRow => ({
	issueId: row.issueId,
	orgId: row.orgId,
	userId: row.userId,
	reason: row.reason,
	muted: row.muted,
});

export const createIssueSubscriptionDao = (db: Database) => ({
	findByIssueAndUser: async (
		issueId: string,
		userId: string,
	): Promise<IssueSubscriptionRow | null> => {
		const row = await db
			.select()
			.from(issueSubscriptions)
			.where(
				and(
					eq(issueSubscriptions.issueId, issueId),
					eq(issueSubscriptions.userId, userId),
				),
			)
			.get();
		return row ? toRow(row) : null;
	},

	listByIssue: async (
		orgId: string,
		issueId: string,
	): Promise<IssueSubscriber[]> => {
		const rows = await db
			.select({
				userId: issueSubscriptions.userId,
				reason: issueSubscriptions.reason,
				muted: issueSubscriptions.muted,
			})
			.from(issueSubscriptions)
			.where(
				and(
					eq(issueSubscriptions.orgId, orgId),
					eq(issueSubscriptions.issueId, issueId),
				),
			);
		return rows;
	},

	/** Automatic subscription: keeps the first reason/mute state on conflict. */
	addIfMissing: async (data: {
		orgId: string;
		issueId: string;
		userId: string;
		reason: IssueSubscriptionReason;
	}): Promise<void> => {
		await db.insert(issueSubscriptions).values(data).onConflictDoNothing();
	},

	addMany: async (
		rows: {
			orgId: string;
			issueId: string;
			userId: string;
			reason: IssueSubscriptionReason;
		}[],
	): Promise<void> => {
		const statements = issueSubscriptionInsertStatements(db, rows);
		if (statements.length > 0) {
			await db.batch(
				statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
			);
		}
	},

	/** Manual toggle: create or unmute, preserving the original reason. */
	setManual: async (
		orgId: string,
		issueId: string,
		userId: string,
		muted: boolean,
	): Promise<void> => {
		await db
			.insert(issueSubscriptions)
			.values({ orgId, issueId, userId, reason: "manual", muted })
			.onConflictDoUpdate({
				target: [issueSubscriptions.issueId, issueSubscriptions.userId],
				set: { muted },
			});
	},

	delete: async (issueId: string, userId: string): Promise<boolean> => {
		const rows = await db
			.delete(issueSubscriptions)
			.where(
				and(
					eq(issueSubscriptions.issueId, issueId),
					eq(issueSubscriptions.userId, userId),
				),
			)
			.returning({ issueId: issueSubscriptions.issueId });
		return rows.length > 0;
	},
});

/**
 * Batch inserts used by fan-out so the notifications and the subscriptions
 * that justify them land in the same D1 transaction. Chunked because D1 caps
 * bound parameters per statement (~100): a subscription row binds 5 columns
 * (the `muted` default is inlined), so 16 rows keep 80 parameters.
 */
const SUBSCRIPTION_INSERT_CHUNK_SIZE = 16;

export const issueSubscriptionInsertStatements = (
	db: Database,
	rows: {
		orgId: string;
		issueId: string;
		userId: string;
		reason: IssueSubscriptionReason;
	}[],
): BatchItem<"sqlite">[] => {
	const statements: BatchItem<"sqlite">[] = [];
	for (
		let start = 0;
		start < rows.length;
		start += SUBSCRIPTION_INSERT_CHUNK_SIZE
	) {
		statements.push(
			db
				.insert(issueSubscriptions)
				.values(rows.slice(start, start + SUBSCRIPTION_INSERT_CHUNK_SIZE))
				.onConflictDoNothing(),
		);
	}
	return statements;
};

export type IssueSubscriptionDao = ReturnType<
	typeof createIssueSubscriptionDao
>;
