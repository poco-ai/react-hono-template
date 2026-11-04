import type {
	IssueSubscriptionReason,
	NotificationFilter,
	NotificationType,
} from "@workspace/shared";
import { and, count, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { user } from "../db/auth-schema";
import { comments, issues, notifications, projects } from "../db/schema";
import type { Database } from "../db/types";
import type {
	NotificationDto,
	NotificationListDto,
} from "../dto/notification.dto";
import { issueSubscriptionInsertStatements } from "./issue-subscription.dao";

export type NotificationInsert = {
	id: string;
	orgId: string;
	userId: string;
	type: NotificationType;
	issueId: string;
	commentId?: string | null;
	activityId?: string | null;
	actorId?: string | null;
	readAt?: Date | null;
};

// D1 caps bound parameters per statement (~100). A notification binds 9
// columns per row (8 × 9 = 72); a subscription binds 5 (16 × 5 = 80), so both
// chunks stay clear of the limit even when a fan-out reaches every org member.
const NOTIFICATION_INSERT_CHUNK_SIZE = 8;

const chunkRows = <T>(rows: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let start = 0; start < rows.length; start += size) {
		chunks.push(rows.slice(start, start + size));
	}
	return chunks;
};

/** Compact plain-text preview: markdown/mention markup is unwrapped, not shown. */
export const commentExcerpt = (body: string): string => {
	const plain = body
		// Fence markers (and their language hint) are markup; keep the code text.
		.replace(/```[^\n]*\n?/g, " ")
		.replace(/~~~[^\n]*\n?/g, " ")
		.replace(/`([^`\n]*)`/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/@\[([^\]\n]*)\]\(user:[^)\s]+\)/g, "@$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^>\s?/gm, "")
		.replace(/^\s{0,3}[-*+]\s+/gm, "")
		.replace(/[*_~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return plain.length > 120 ? `${plain.slice(0, 117)}...` : plain;
};

// D1 batch rows are keyed by column name: every joined column gets a unique
// alias so values do not shift (drizzle-orm#6038).
const NOTIFICATION_SELECT = {
	id: notifications.id,
	orgId: notifications.orgId,
	type: notifications.type,
	issueId: notifications.issueId,
	commentId: notifications.commentId,
	activityId: notifications.activityId,
	readAt: notifications.readAt,
	createdAt: notifications.createdAt,
	actor: {
		id: user.id.as("notification_actor_id"),
		name: user.name.as("notification_actor_name"),
		email: user.email.as("notification_actor_email"),
		image: user.image.as("notification_actor_image"),
	},
	issue: {
		id: issues.id.as("notification_issue_id"),
		number: issues.number.as("notification_issue_number"),
		title: issues.title.as("notification_issue_title"),
		projectId: issues.projectId.as("notification_issue_project_id"),
	},
	project: {
		id: projects.id.as("notification_project_id"),
		key: projects.key.as("notification_project_key"),
		name: projects.name.as("notification_project_name"),
	},
};

type NotificationRow = {
	id: string;
	orgId: string;
	type: string;
	issueId: string;
	commentId: string | null;
	activityId: string | null;
	readAt: Date | null;
	createdAt: Date;
	actor: {
		id: string | null;
		name: string | null;
		email: string | null;
		image: string | null;
	} | null;
	issue: {
		id: string;
		number: number;
		title: string;
		projectId: string;
	};
	project: { id: string; key: string; name: string };
};

const toNotificationDto = (
	row: NotificationRow,
	excerpt: string | null,
): NotificationDto => ({
	id: row.id,
	orgId: row.orgId,
	type: row.type as NotificationType,
	issueId: row.issueId,
	commentId: row.commentId,
	commentExcerpt: excerpt,
	activityId: row.activityId,
	readAt: row.readAt ? row.readAt.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	actor:
		row.actor?.id && row.actor.name !== null
			? {
					id: row.actor.id,
					name: row.actor.name,
					email: row.actor.email ?? "",
					image: row.actor.image,
				}
			: null,
	issue: row.issue,
	project: row.project,
});

const baseQuery = (db: Database) =>
	db
		.select(NOTIFICATION_SELECT)
		.from(notifications)
		.leftJoin(user, eq(user.id, notifications.actorId))
		.innerJoin(issues, eq(issues.id, notifications.issueId))
		.innerJoin(projects, eq(projects.id, issues.projectId));

export const createNotificationDao = (db: Database) => ({
	listByUser: async (
		orgId: string,
		userId: string,
		query: { filter: NotificationFilter; page: number; pageSize: number },
	): Promise<NotificationListDto> => {
		const conditions: SQL[] = [
			eq(notifications.orgId, orgId),
			eq(notifications.userId, userId),
		];
		if (query.filter === "unread") {
			conditions.push(isNull(notifications.readAt));
		}
		const where = and(...conditions);
		const [rows, totals, unread] = await db.batch([
			baseQuery(db)
				.where(where)
				.orderBy(desc(notifications.createdAt), desc(notifications.id))
				.limit(query.pageSize)
				.offset((query.page - 1) * query.pageSize),
			db.select({ value: count() }).from(notifications).where(where),
			db
				.select({ value: count() })
				.from(notifications)
				.where(
					and(
						eq(notifications.orgId, orgId),
						eq(notifications.userId, userId),
						isNull(notifications.readAt),
					),
				),
		]);
		// One extra query for the page's comment previews (never per item).
		const commentIds = [
			...new Set(
				rows
					.map((row) => row.commentId)
					.filter((id): id is string => Boolean(id)),
			),
		];
		const excerpts = new Map<string, string>();
		if (commentIds.length > 0) {
			const commentRows = await db
				.select({ id: comments.id, body: comments.body })
				.from(comments)
				.where(inArray(comments.id, commentIds));
			for (const comment of commentRows) {
				const excerpt = commentExcerpt(comment.body);
				if (excerpt) {
					excerpts.set(comment.id, excerpt);
				}
			}
		}
		return {
			items: rows.map((row) =>
				toNotificationDto(
					row,
					row.commentId ? (excerpts.get(row.commentId) ?? null) : null,
				),
			),
			total: totals[0]?.value ?? 0,
			page: query.page,
			pageSize: query.pageSize,
			unread: unread[0]?.value ?? 0,
		};
	},

	countUnread: async (orgId: string, userId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(notifications)
			.where(
				and(
					eq(notifications.orgId, orgId),
					eq(notifications.userId, userId),
					isNull(notifications.readAt),
				),
			);
		return row?.value ?? 0;
	},

	markRead: async (
		orgId: string,
		userId: string,
		id: string,
		readAt: Date,
	): Promise<boolean> => {
		const rows = await db
			.update(notifications)
			.set({ readAt })
			.where(
				and(
					eq(notifications.orgId, orgId),
					eq(notifications.userId, userId),
					eq(notifications.id, id),
				),
			)
			.returning({ id: notifications.id });
		return rows.length > 0;
	},

	markAllRead: async (orgId: string, userId: string, readAt: Date) => {
		const rows = await db
			.update(notifications)
			.set({ readAt })
			.where(
				and(
					eq(notifications.orgId, orgId),
					eq(notifications.userId, userId),
					isNull(notifications.readAt),
				),
			)
			.returning({ id: notifications.id });
		return rows.length;
	},

	delete: async (orgId: string, userId: string, id: string) => {
		const rows = await db
			.delete(notifications)
			.where(
				and(
					eq(notifications.orgId, orgId),
					eq(notifications.userId, userId),
					eq(notifications.id, id),
				),
			)
			.returning({ id: notifications.id });
		return rows.length > 0;
	},

	/**
	 * Fan-out write: inserts every notification plus the subscriptions that
	 * justify them in a single D1 batch (one transaction), avoiding
	 * per-recipient round trips. Rows are chunked per statement so a large
	 * fan-out never exceeds D1's bound-parameter limit.
	 */
	createMany: async (
		rows: NotificationInsert[],
		subscriptions: {
			orgId: string;
			issueId: string;
			userId: string;
			reason: IssueSubscriptionReason;
		}[] = [],
	): Promise<void> => {
		const statements: BatchItem<"sqlite">[] = [
			...notificationInsertStatements(db, rows),
			...issueSubscriptionInsertStatements(db, subscriptions),
		];
		if (statements.length > 0) {
			await db.batch(
				statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
			);
		}
	},
});

/**
 * Chunked insert statements for fan-out. Callers put them in the same
 * `db.batch` as the triggering write so the transaction stays atomic.
 */
export const notificationInsertStatements = (
	db: Database,
	rows: NotificationInsert[],
): BatchItem<"sqlite">[] =>
	chunkRows(rows, NOTIFICATION_INSERT_CHUNK_SIZE).map((chunk) =>
		db.insert(notifications).values(
			// Normalize optional columns so every chunk has the same shape.
			chunk.map((row) => ({
				...row,
				commentId: row.commentId ?? null,
				activityId: row.activityId ?? null,
				actorId: row.actorId ?? null,
				readAt: row.readAt ?? null,
			})),
		),
	);

export type NotificationDao = ReturnType<typeof createNotificationDao>;
