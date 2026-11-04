import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	commentReactionSchema,
	MAX_COMMENT_MENTIONS,
	parseMentionUserIds,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createCommentDao } from "../src/dao/comment.dao";
import {
	commentMentionInsertStatements,
	createCommentMentionDao,
} from "../src/dao/comment-mention.dao";
import { createCommentReactionDao } from "../src/dao/comment-reaction.dao";
import type { IssueDao } from "../src/dao/issue.dao";
import { createIssueSubscriptionDao } from "../src/dao/issue-subscription.dao";
import {
	commentExcerpt,
	createNotificationDao,
} from "../src/dao/notification.dao";
import type { ProjectDao } from "../src/dao/project.dao";
import type { Database as AppDatabase } from "../src/db/types";
import type { IssueDto } from "../src/dto/issue.dto";
import { createCommentService } from "../src/services/comment.service";
import { createIssueService } from "../src/services/issue.service";
import { createIssueSubscriptionService } from "../src/services/issue-subscription.service";
import { createNotificationService } from "../src/services/notification.service";

const DDL = `
CREATE TABLE user (
	id text PRIMARY KEY,
	name text,
	email text,
	image text
);
CREATE TABLE projects (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	key text NOT NULL,
	name text NOT NULL
);
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	number integer NOT NULL,
	title text NOT NULL,
	assignee_id text,
	status_id text,
	deleted_at integer,
	created_at integer,
	updated_at integer
);
CREATE TABLE comments (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	issue_id text NOT NULL,
	author_id text NOT NULL,
	parent_id text,
	body text NOT NULL,
	resolved_at integer,
	resolved_by_id text,
	created_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	updated_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE TABLE activities (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	issue_id text NOT NULL,
	actor_id text NOT NULL,
	action text NOT NULL,
	field text,
	old_value text,
	new_value text,
	source text,
	source_id text,
	created_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE TABLE notifications (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	user_id text NOT NULL,
	type text NOT NULL,
	issue_id text NOT NULL,
	comment_id text,
	activity_id text,
	actor_id text,
	read_at integer,
	created_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE TABLE issue_subscriptions (
	issue_id text NOT NULL,
	user_id text NOT NULL,
	org_id text NOT NULL,
	reason text NOT NULL DEFAULT 'manual',
	muted integer NOT NULL DEFAULT 0,
	created_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	PRIMARY KEY (issue_id, user_id)
);
CREATE TABLE comment_reactions (
	comment_id text NOT NULL,
	user_id text NOT NULL,
	emoji text NOT NULL,
	created_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	PRIMARY KEY (comment_id, user_id, emoji)
);
CREATE TABLE comment_mentions (
	comment_id text NOT NULL,
	user_id text NOT NULL,
	PRIMARY KEY (comment_id, user_id)
);
`;

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	// Statements of the most recent batches, used to assert fan-out chunking.
	const batches: unknown[][] = [];
	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			batches.push(statements);
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	});
	return { sqlite, batches, db: db as unknown as AppDatabase };
};

const seed = (sqlite: Database) => {
	for (const id of ["creator", "watcher", "assignee", "parent", "member-2"]) {
		sqlite.run(
			"INSERT INTO user (id, name, email) VALUES (?, ?, ?)",
			id,
			id,
			`${id}@example.com`,
		);
	}
	sqlite.run(
		"INSERT INTO projects (id, org_id, key, name) VALUES ('project-1', 'org-1', 'WEB', 'Web')",
	);
	sqlite.run(
		"INSERT INTO issues (id, org_id, project_id, number, title) VALUES ('issue-1', 'org-1', 'project-1', 7, 'Broken login')",
	);
	sqlite.run(
		"INSERT INTO issues (id, org_id, project_id, number, title) VALUES ('issue-2', 'org-2', 'project-2', 1, 'Other org')",
	);
};

const issue: IssueDto = {
	id: "issue-1",
	orgId: "org-1",
	projectId: "project-1",
	number: 7,
	title: "Broken login",
	description: null,
	statusId: "status-backlog",
	status: {
		id: "status-backlog",
		orgId: "org-1",
		name: "Backlog",
		category: "backlog",
		color: "#64748b",
		position: 0,
		isDefault: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
	priority: 0,
	assigneeId: null,
	createdById: "creator",
	dueDate: null,
	estimate: null,
	parentId: null,
	cycleId: null,
	deletedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

test("mention markup parses valid ids, dedupes and ignores malformed text", () => {
	assert.deepEqual(
		parseMentionUserIds(
			"Hi @[Ada](user:u1) and @[Bo](user:u2), again @[Ada](user:u1). Email a@b.com",
		),
		["u1", "u2"],
	);
	assert.deepEqual(parseMentionUserIds("@[Broken](u1) or @[](user: )"), []);
});

test("mentions inside fenced and inline code are examples, not mentions", () => {
	assert.deepEqual(
		parseMentionUserIds(
			"```ts\n@[Ada](user:u1)\n```\nReal @[Bo](user:u2)\n~~~\n@[Cy](user:u3)\n~~~",
		),
		["u2"],
	);
	assert.deepEqual(
		parseMentionUserIds("Use `@[Ada](user:u1)` in docs, then @[Bo](user:u2)"),
		["u2"],
	);
	assert.deepEqual(parseMentionUserIds("@[Ada](user:u1)"), ["u1"]);
});

test("comment mentions are capped so 101 mentions never overflow D1", async () => {
	// The parser truncates unique ids, keeping the first ones in document order.
	const many = Array.from(
		{ length: 101 },
		(_, index) => `@[U${index}](user:user-${index})`,
	).join(" ");
	const parsed = parseMentionUserIds(many);
	assert.equal(parsed.length, MAX_COMMENT_MENTIONS);
	assert.equal(parsed[0], "user-0");

	// Even with more rows than the cap, the insert helper chunks under the
	// ~100 bound-parameter limit (2 params per row, 25 rows per statement).
	const { sqlite, db, batches } = setup();
	seed(sqlite);
	const calls = { commentNotifications: [] as never[] };
	const { service } = commentServiceFor(db, calls);
	const comment = await service.createComment(
		"org-1",
		"project-1",
		7,
		"creator",
		{
			body: many,
		},
	);
	const stored = sqlite
		.query(
			"SELECT count(*) AS count FROM comment_mentions WHERE comment_id = ?",
		)
		.get(comment.id) as { count: number };
	assert.equal(stored.count, MAX_COMMENT_MENTIONS);
	assert.equal(
		(calls.commentNotifications[0] as { mentionUserIds: string[] })
			.mentionUserIds.length,
		MAX_COMMENT_MENTIONS,
	);

	const rows = Array.from({ length: 101 }, (_, index) => ({
		commentId: comment.id,
		userId: `user-${index}`,
	}));
	const statements = commentMentionInsertStatements(db, rows);
	assert.equal(statements.length, Math.ceil(101 / 25));
	for (const statement of statements) {
		const { params } = (
			statement as unknown as { toSQL: () => { params: unknown[] } }
		).toSQL();
		assert.ok(params.length <= 100, `statement binds ${params.length} params`);
	}
	// Keep the batch spy referenced so it is obviously exercised above.
	assert.ok(batches.length > 0);
});

test("reaction emoji whitelist rejects unknown emoji", () => {
	assert.equal(commentReactionSchema.safeParse({ emoji: "👍" }).success, true);
	assert.equal(commentReactionSchema.safeParse({ emoji: "🔥" }).success, false);
});

test("issue and comment fan-out respects subscribers, mute, dedupe and ownership", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const notificationDao = createNotificationDao(db);
	const subscriptionDao = createIssueSubscriptionDao(db);
	const service = createNotificationService({
		notificationDao,
		subscriptionDao,
	});

	await subscriptionDao.addMany([
		{
			orgId: "org-1",
			issueId: "issue-1",
			userId: "creator",
			reason: "creator",
		},
		{ orgId: "org-1", issueId: "issue-1", userId: "watcher", reason: "manual" },
	]);

	// Status change: every subscriber except the actor, once.
	await service.onIssueUpdated({
		issue,
		actorId: "creator",
		statusChanged: true,
		assignedUserId: null,
	});
	assert.equal(await notificationDao.countUnread("org-1", "creator"), 0);
	assert.equal(await notificationDao.countUnread("org-1", "watcher"), 1);
	const watcherPage = await service.listInbox("org-1", "watcher", {
		filter: "all",
		page: 1,
		pageSize: 20,
	});
	assert.equal(watcherPage.items[0]?.type, "issue_status_changed");
	assert.equal(watcherPage.items[0]?.project.key, "WEB");
	assert.equal(watcherPage.items[0]?.issue.number, 7);

	// Assignment auto-subscribes the assignee and notifies them.
	await service.onIssueUpdated({
		issue,
		actorId: "creator",
		statusChanged: false,
		assignedUserId: "assignee",
	});
	const assigneeSub = await subscriptionDao.findByIssueAndUser(
		"issue-1",
		"assignee",
	);
	assert.equal(assigneeSub?.reason, "assignee");
	assert.equal(await notificationDao.countUnread("org-1", "assignee"), 1);

	// Comment: subscribers get commented, mentions win over reply, actor is
	// excluded, and one user never gets two notifications for the same comment.
	await service.onCommentCreated({
		issue,
		commentId: "comment-1",
		actorId: "watcher",
		parentAuthorId: "parent",
		mentionUserIds: ["parent", "assignee"],
	});
	const byUser = new Map<string, string>();
	let notificationCount = 0;
	for (const userId of ["creator", "watcher", "assignee", "parent"]) {
		const page = await notificationDao.listByUser("org-1", userId, {
			filter: "all",
			page: 1,
			pageSize: 50,
		});
		notificationCount += page.items.length;
		assert.equal(page.total, page.items.length);
		assert.equal(
			new Set(page.items.map((item) => item.id)).size,
			page.items.length,
			`duplicate notification rows for ${userId}`,
		);
		// One recipient gets at most one notification per comment, whichever
		// priority won.
		const commentNotifications = page.items.filter(
			(item) => item.commentId === "comment-1",
		);
		assert.ok(commentNotifications.length <= 1);
		for (const item of page.items) {
			byUser.set(`${userId}:${item.type}`, item.id);
		}
	}
	assert.ok(byUser.has("creator:issue_commented"));
	assert.ok(byUser.has("assignee:comment_mention"));
	assert.ok(byUser.has("parent:comment_mention"));
	assert.ok(!byUser.has("watcher:issue_commented"));
	assert.ok(!byUser.has("parent:comment_reply"));
	// No (user, type) pair was notified twice across the fan-out.
	assert.equal(byUser.size, notificationCount);

	// Muted subscribers keep the subscription but receive nothing.
	await subscriptionDao.setManual("org-1", "issue-1", "assignee", true);
	const before = await notificationDao.countUnread("org-1", "assignee");
	await service.onCommentCreated({
		issue,
		commentId: "comment-2",
		actorId: "watcher",
		parentAuthorId: null,
		mentionUserIds: ["assignee"],
	});
	assert.equal(await notificationDao.countUnread("org-1", "assignee"), before);

	// Mark-read is owner scoped: another user gets a 404, even in another org.
	await assert.rejects(
		service.markRead("org-1", "parent", "not-mine"),
		(error: unknown) =>
			error instanceof ApiError &&
			error.status === 404 &&
			error.code === ApiErrorCode.NOTIFICATION_NOT_FOUND,
	);
	const watcherNotification = watcherPage.items[0];
	assert.ok(watcherNotification);
	await service.markRead("org-1", "watcher", watcherNotification.id);
	assert.equal(await notificationDao.countUnread("org-1", "watcher"), 0);
	// A notification stored in another organization is invisible here, even
	// for the same user id.
	await notificationDao.createMany([
		{
			id: "other-org-notification",
			orgId: "org-2",
			userId: "watcher",
			type: "issue_commented",
			issueId: "issue-2",
			actorId: "creator",
			readAt: null,
		},
	]);
	await assert.rejects(
		service.markRead("org-1", "watcher", "other-org-notification"),
		(error: unknown) => error instanceof ApiError && error.status === 404,
	);
	assert.equal(
		(
			await service.listInbox("org-2", "watcher", {
				filter: "all",
				page: 1,
				pageSize: 20,
			})
		).total,
		1,
	);
	assert.equal(
		(
			await service.listInbox("org-1", "watcher", {
				filter: "all",
				page: 1,
				pageSize: 20,
			})
		).total,
		1,
	);
	await service.markRead("org-2", "watcher", "other-org-notification");
	assert.equal(await notificationDao.countUnread("org-2", "watcher"), 0);
});

test("manual subscription toggles create, mute and remove the follow row", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const subscriptionDao = createIssueSubscriptionDao(db);
	const service = createIssueSubscriptionService({
		issueDao: {
			findByProjectAndNumber: async (orgId: string, projectId: string) =>
				orgId === "org-1" && projectId === "project-1" ? issue : null,
		} as unknown as IssueDao,
		subscriptionDao,
	});

	assert.deepEqual(
		await service.getSubscription("org-1", "project-1", 7, "watcher"),
		{ subscribed: false, muted: false, reason: null },
	);
	assert.deepEqual(
		await service.updateSubscription("org-1", "project-1", 7, "watcher", {
			subscribed: true,
		}),
		{ subscribed: true, muted: false, reason: "manual" },
	);
	assert.deepEqual(
		await service.updateSubscription("org-1", "project-1", 7, "watcher", {
			subscribed: true,
			muted: true,
		}),
		{ subscribed: true, muted: true, reason: "manual" },
	);
	assert.deepEqual(
		await service.updateSubscription("org-1", "project-1", 7, "watcher", {
			subscribed: false,
		}),
		{ subscribed: false, muted: false, reason: null },
	);
	await assert.rejects(
		service.getSubscription("org-2", "project-1", 7, "watcher"),
		(error: unknown) =>
			error instanceof ApiError &&
			error.status === 404 &&
			error.code === ApiErrorCode.ISSUE_NOT_FOUND,
	);
});

const commentServiceFor = (
	db: AppDatabase,
	calls: {
		commentNotifications: {
			parentAuthorId?: string | null;
			mentionUserIds: string[];
		}[];
	},
) => {
	const commentDao = createCommentDao(db);
	const reactionDao = createCommentReactionDao(db);
	const mentionDao = createCommentMentionDao(db);
	const service = createCommentService({
		commentDao,
		reactionDao,
		mentionDao,
		issueDao: {
			findByProjectAndNumber: async () => issue,
		} as unknown as IssueDao,
		projectDao: {
			findById: async () => ({ id: "project-1", archived: false }),
		} as unknown as ProjectDao,
		memberDao: {
			filterMemberIds: async (_orgId: string, ids: string[]) =>
				ids.filter((id) => id !== "outsider"),
		},
		notifications: {
			onCommentCreated: async (input) => {
				calls.commentNotifications.push({
					parentAuthorId: input.parentAuthorId,
					mentionUserIds: input.mentionUserIds,
				});
			},
			onCommentResolved: async () => {},
		},
	});
	return { service, commentDao, reactionDao, mentionDao };
};

test("comment replies are one level deep and mentions ignore non-members", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const calls = { commentNotifications: [] as never[] };
	const { service, mentionDao } = commentServiceFor(db, calls);

	const top = await service.createComment("org-1", "project-1", 7, "creator", {
		body: "Top level @[Outsider](user:outsider) @[Member](user:member-2)",
	});
	assert.equal(top.parentId, null);
	const mentions = await mentionDao.listByComments([top.id]);
	assert.deepEqual(
		mentions.map((row) => row.user.id),
		["member-2"],
	);
	assert.deepEqual(
		(calls.commentNotifications[0] as { mentionUserIds: string[] })
			.mentionUserIds,
		["member-2"],
	);

	await service.createComment("org-1", "project-1", 7, "watcher", {
		body: "Reply",
		parentId: top.id,
	});
	const reply = await service.createComment("org-1", "project-1", 7, "parent", {
		body: "Reply to reply",
		parentId: top.id,
	});
	await assert.rejects(
		service.createComment("org-1", "project-1", 7, "assignee", {
			body: "Nested",
			parentId: reply.id,
		}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.status === 400 &&
			error.code === ApiErrorCode.COMMENT_THREAD_DEPTH,
	);
});

test("reply notifications target the parent author and resolve notifies the author", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const calls = { commentNotifications: [] as never[] };
	const { service } = commentServiceFor(db, calls);

	const top = await service.createComment("org-1", "project-1", 7, "parent", {
		body: "Please check",
	});
	await service.createComment("org-1", "project-1", 7, "watcher", {
		body: "Looking",
		parentId: top.id,
	});
	assert.equal(
		(calls.commentNotifications[1] as { parentAuthorId: string })
			.parentAuthorId,
		"parent",
	);

	const resolved = await service.resolveComment(
		"org-1",
		"project-1",
		7,
		top.id,
		"assignee",
		true,
	);
	assert.ok(resolved.resolvedAt);
	assert.equal(resolved.resolvedById, "assignee");
	// Any org member may resolve, but replies cannot be resolved directly.
	const reply = await service.createComment(
		"org-1",
		"project-1",
		7,
		"watcher",
		{
			body: "Another reply",
			parentId: top.id,
		},
	);
	await assert.rejects(
		service.resolveComment("org-1", "project-1", 7, reply.id, "creator", true),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.COMMENT_THREAD_DEPTH,
	);
});

test("reaction toggles are idempotent and aggregate per emoji", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const calls = { commentNotifications: [] as never[] };
	const { service, commentDao } = commentServiceFor(db, calls);
	const comment = await commentDao.create({
		id: "comment-1",
		orgId: "org-1",
		issueId: "issue-1",
		authorId: "creator",
		body: "Ship it",
	});

	const added = await service.toggleReaction(
		"org-1",
		"project-1",
		7,
		comment.id,
		"watcher",
		{ emoji: "🚀" },
	);
	assert.deepEqual(added.reactions, [{ emoji: "🚀", count: 1, mine: true }]);

	const removed = await service.toggleReaction(
		"org-1",
		"project-1",
		7,
		comment.id,
		"watcher",
		{ emoji: "🚀" },
	);
	assert.deepEqual(removed.reactions, []);

	await service.toggleReaction("org-1", "project-1", 7, comment.id, "watcher", {
		emoji: "🎉",
	});
	const aggregated = await service.toggleReaction(
		"org-1",
		"project-1",
		7,
		comment.id,
		"creator",
		{ emoji: "🎉" },
	);
	assert.deepEqual(aggregated.reactions, [
		{ emoji: "🎉", count: 2, mine: true },
	]);
});

test("concurrent and repeated reaction toggles never duplicate a row", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const calls = { commentNotifications: [] as never[] };
	const { service, commentDao, reactionDao } = commentServiceFor(db, calls);
	const comment = await commentDao.create({
		id: "comment-1",
		orgId: "org-1",
		issueId: "issue-1",
		authorId: "creator",
		body: "Ship it",
	});

	// Two toggles racing: the delete-then-insert guard must not violate the
	// (comment, user, emoji) primary key.
	await Promise.all([
		service.toggleReaction("org-1", "project-1", 7, comment.id, "watcher", {
			emoji: "👍",
		}),
		service.toggleReaction("org-1", "project-1", 7, comment.id, "watcher", {
			emoji: "👍",
		}),
	]);
	const rows = await reactionDao.listByComments([comment.id]);
	assert.equal(
		rows.filter((row) => row.userId === "watcher" && row.emoji === "👍").length,
		1,
	);

	// Repeated toggle calls keep alternating without errors.
	assert.equal(
		(
			await service.toggleReaction(
				"org-1",
				"project-1",
				7,
				comment.id,
				"watcher",
				{
					emoji: "👀",
				},
			)
		).reactions.find((reaction) => reaction.emoji === "👀")?.count,
		1,
	);
	assert.equal(
		(
			await service.toggleReaction(
				"org-1",
				"project-1",
				7,
				comment.id,
				"watcher",
				{
					emoji: "👀",
				},
			)
		).reactions.some((reaction) => reaction.emoji === "👀"),
		false,
	);
});

test("self-assignment subscribes the actor without notifying them", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const notificationDao = createNotificationDao(db);
	const subscriptionDao = createIssueSubscriptionDao(db);
	const service = createNotificationService({
		notificationDao,
		subscriptionDao,
	});

	await service.onIssueUpdated({
		issue,
		actorId: "watcher",
		statusChanged: false,
		assignedUserId: "watcher",
	});
	const selfSub = await subscriptionDao.findByIssueAndUser(
		"issue-1",
		"watcher",
	);
	assert.equal(selfSub?.reason, "assignee");
	assert.equal(selfSub?.muted, false);
	assert.equal(await notificationDao.countUnread("org-1", "watcher"), 0);

	// Assigning someone else still notifies them exactly once.
	await service.onIssueUpdated({
		issue,
		actorId: "watcher",
		statusChanged: false,
		assignedUserId: "assignee",
	});
	assert.equal(await notificationDao.countUnread("org-1", "assignee"), 1);
	const page = await service.listInbox("org-1", "assignee", {
		filter: "all",
		page: 1,
		pageSize: 20,
	});
	assert.equal(page.total, 1);
	assert.equal(page.items[0]?.type, "issue_assigned");
});

test("creating an issue with an assignee notifies and subscribes them", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const notificationDao = createNotificationDao(db);
	const subscriptionDao = createIssueSubscriptionDao(db);
	const service = createNotificationService({
		notificationDao,
		subscriptionDao,
	});

	await service.onIssueCreated({ ...issue, assigneeId: "assignee" }, "creator");
	const creatorSub = await subscriptionDao.findByIssueAndUser(
		"issue-1",
		"creator",
	);
	const assigneeSub = await subscriptionDao.findByIssueAndUser(
		"issue-1",
		"assignee",
	);
	assert.equal(creatorSub?.reason, "creator");
	assert.equal(assigneeSub?.reason, "assignee");
	assert.equal(await notificationDao.countUnread("org-1", "assignee"), 1);
	assert.equal(await notificationDao.countUnread("org-1", "creator"), 0);
	const page = await service.listInbox("org-1", "assignee", {
		filter: "all",
		page: 1,
		pageSize: 20,
	});
	assert.equal(page.total, 1);
	assert.equal(page.items[0]?.type, "issue_assigned");

	// Assigning yourself at creation only records the subscription.
	await service.onIssueCreated(
		{ ...issue, id: "issue-self", assigneeId: "creator" },
		"creator",
	);
	const selfSub = await subscriptionDao.findByIssueAndUser(
		"issue-self",
		"creator",
	);
	assert.equal(selfSub?.reason, "creator");
	assert.equal(await notificationDao.countUnread("org-1", "creator"), 0);
});

test("fan-out chunks inserts under D1's bound-parameter limit", async () => {
	const { sqlite, db, batches } = setup();
	seed(sqlite);
	const notificationDao = createNotificationDao(db);
	const recipients = Array.from({ length: 50 }, (_, index) => `sub-${index}`);
	await notificationDao.createMany(
		recipients.map((userId, index) => ({
			id: `notification-${index}`,
			orgId: "org-1",
			userId,
			type: "issue_status_changed" as const,
			issueId: "issue-1",
			actorId: "creator",
			readAt: null,
		})),
		recipients.map((userId) => ({
			orgId: "org-1",
			issueId: "issue-1",
			userId,
			reason: "manual" as const,
		})),
	);

	const statements = batches.at(-1) as {
		toSQL: () => { sql: string; params: unknown[] };
	}[];
	// 50 notifications chunk at 8 rows (7 statements); 50 subscriptions
	// chunk at 16 rows (4 statements) — all still one batch/transaction.
	assert.equal(statements.length, 7 + 4);
	let notificationRows = 0;
	let subscriptionRows = 0;
	for (const statement of statements) {
		const { sql, params } = statement.toSQL();
		assert.ok(params.length <= 100, `statement binds ${params.length} params`);
		if (sql.includes("notifications")) {
			notificationRows += params.length / 9;
		} else {
			// issue_subscriptions binds 5 columns per row (muted is inlined).
			subscriptionRows += params.length / 5;
		}
	}
	assert.equal(notificationRows, 50);
	assert.equal(subscriptionRows, 50);
	assert.deepEqual(
		sqlite
			.query(
				"select (select count(*) from notifications) as n, (select count(*) from issue_subscriptions) as s",
			)
			.get(),
		{ n: 50, s: 50 },
	);
});

test("notifications for soft-deleted issues leave the inbox", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const notificationDao = createNotificationDao(db);
	sqlite.run(
		"INSERT INTO notifications (id, org_id, user_id, type, issue_id, created_at) VALUES ('n1', 'org-1', 'watcher', 'issue_commented', 'issue-1', 1)",
	);
	assert.equal(await notificationDao.countUnread("org-1", "watcher"), 1);

	// The issue page 404s after a soft delete, so its notifications must not
	// stay in the inbox (neither as rows nor in the totals/unread badge).
	sqlite.run("UPDATE issues SET deleted_at = 1 WHERE id = 'issue-1'");
	const page = await notificationDao.listByUser("org-1", "watcher", {
		filter: "all",
		page: 1,
		pageSize: 20,
	});
	assert.deepEqual(page.items, []);
	assert.equal(page.total, 0);
	assert.equal(page.unread, 0);
	assert.equal(await notificationDao.countUnread("org-1", "watcher"), 0);
});

test("notification DTOs carry a plain-text comment excerpt", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	sqlite.run(
		"INSERT INTO comments (id, org_id, issue_id, author_id, body) VALUES (?, ?, ?, ?, ?)",
		"comment-x",
		"org-1",
		"issue-1",
		"watcher",
		"```ts\n@[Ada](user:u1)\n```\n**Hi** @[Bo](user:assignee) see [docs](https://example.com)",
	);
	const notificationDao = createNotificationDao(db);
	await notificationDao.createMany([
		{
			id: "n-comment",
			orgId: "org-1",
			userId: "watcher",
			type: "comment_mention",
			issueId: "issue-1",
			commentId: "comment-x",
			actorId: "creator",
			readAt: null,
		},
		{
			id: "n-assigned",
			orgId: "org-1",
			userId: "watcher",
			type: "issue_assigned",
			issueId: "issue-1",
			actorId: "creator",
			readAt: null,
		},
	]);
	const page = await notificationDao.listByUser("org-1", "watcher", {
		filter: "all",
		page: 1,
		pageSize: 20,
	});
	const byId = new Map(page.items.map((item) => [item.id, item]));
	assert.equal(byId.get("n-comment")?.commentExcerpt, "@Ada Hi @Bo see docs");
	assert.equal(byId.get("n-assigned")?.commentExcerpt, null);
	assert.equal(commentExcerpt("x".repeat(200)).length, 120);
});

test("editing a comment rewrites mention rows without re-notifying", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const calls = { commentNotifications: [] as never[] };
	const { service, mentionDao } = commentServiceFor(db, calls);

	const created = await service.createComment(
		"org-1",
		"project-1",
		7,
		"creator",
		{
			body: "Ping @[Member](user:member-2)",
		},
	);
	assert.deepEqual(
		created.mentions.map((mention) => mention.id),
		["member-2"],
	);
	const notificationCalls = calls.commentNotifications.length;

	const edited = await service.updateComment(
		"org-1",
		"project-1",
		7,
		created.id,
		"creator",
		{
			body: "Now @[Assignee](user:assignee) and @[Member](user:member-2), again @[Assignee](user:assignee) and @[Outsider](user:outsider)",
		},
	);
	assert.deepEqual(edited.mentions.map((mention) => mention.id).sort(), [
		"assignee",
		"member-2",
	]);
	assert.deepEqual(
		(await mentionDao.listByComments([created.id]))
			.map((row) => row.user.id)
			.sort(),
		["assignee", "member-2"],
	);

	const cleared = await service.updateComment(
		"org-1",
		"project-1",
		7,
		created.id,
		"creator",
		{ body: "No mentions now" },
	);
	assert.deepEqual(cleared.mentions, []);
	assert.deepEqual(await mentionDao.listByComments([created.id]), []);
	assert.equal(calls.commentNotifications.length, notificationCalls);
});

test("notification fan-out failures never fail the issue or comment write", async () => {
	const { sqlite, db } = setup();
	seed(sqlite);
	const originalError = console.error;
	const logged: unknown[][] = [];
	console.error = (...args: unknown[]) => {
		logged.push(args);
	};
	try {
		const issueService = createIssueService({
			issueDao: {
				createWithNumber: async () => issue,
			} as unknown as IssueDao,
			labelDao: { findByIds: async () => [] } as unknown as never,
			projectDao: {
				findById: async () => ({ id: "project-1", archived: false }),
			} as unknown as ProjectDao,
			memberDao: { findByOrgAndUser: async () => null } as unknown as never,
			cycleDao: {
				findById: async () => null,
				listAllByProject: async () => [],
			},
			statusService: {
				resolveStatus: async () => issue.status,
			} as unknown as never,
			notifications: {
				onIssueCreated: async () => {
					throw new Error("notification fan-out down");
				},
				onIssueUpdated: async () => {
					throw new Error("notification fan-out down");
				},
			},
		});
		const createdIssue = await issueService.createIssue(
			"org-1",
			"project-1",
			"creator",
			{ title: "Broken login" },
		);
		assert.equal(createdIssue.id, "issue-1");

		const commentDao = createCommentDao(db);
		const commentService = createCommentService({
			commentDao,
			reactionDao: createCommentReactionDao(db),
			mentionDao: createCommentMentionDao(db),
			issueDao: {
				findByProjectAndNumber: async () => issue,
			} as unknown as IssueDao,
			projectDao: {
				findById: async () => ({ id: "project-1", archived: false }),
			} as unknown as ProjectDao,
			notifications: {
				onCommentCreated: async () => {
					throw new Error("notification fan-out down");
				},
				onCommentResolved: async () => {
					throw new Error("notification fan-out down");
				},
			},
		});
		const comment = await commentService.createComment(
			"org-1",
			"project-1",
			7,
			"creator",
			{ body: "Still written" },
		);
		assert.equal(comment.body, "Still written");
		assert.ok(await commentDao.findById("org-1", comment.id));
		const resolved = await commentService.resolveComment(
			"org-1",
			"project-1",
			7,
			comment.id,
			"watcher",
			true,
		);
		assert.ok(resolved.resolvedAt);
	} finally {
		console.error = originalError;
	}
	// Both fan-out attempts were logged instead of propagated.
	assert.ok(logged.length >= 3);
});
