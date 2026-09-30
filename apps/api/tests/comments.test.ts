import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { ActivityInsert } from "../src/dao/activity.dao";
import type { CommentDao } from "../src/dao/comment.dao";
import type { IssueDao } from "../src/dao/issue.dao";
import type { ProjectDao } from "../src/dao/project.dao";
import type { CommentDto } from "../src/dto/comment.dto";
import type { IssueDto } from "../src/dto/issue.dto";
import { createCommentService } from "../src/services/comment.service";

const issueDto = (overrides: Partial<IssueDto> = {}): IssueDto => ({
	id: "issue-1",
	orgId: "org",
	projectId: "project-1",
	number: 7,
	title: "Broken login",
	description: null,
	status: "backlog",
	priority: 0,
	assigneeId: null,
	createdById: null,
	dueDate: null,
	estimate: null,
	deletedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const commentDto = (overrides: Partial<CommentDto> = {}): CommentDto => ({
	id: "comment-1",
	orgId: "org",
	issueId: "issue-1",
	body: "Looks good",
	author: {
		id: "author-1",
		name: "Author",
		email: "author@example.com",
		image: null,
	},
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const serviceFor = ({
	issue = issueDto() as IssueDto | null,
	archived = false,
	comment = commentDto() as CommentDto | null,
} = {}) => {
	const calls = {
		commented: [] as {
			data: Record<string, unknown>;
			activity: ActivityInsert;
		}[],
		dispatched: [] as { orgId: string; event: string; data: unknown }[],
	};
	const service = createCommentService({
		issueDao: {
			findByProjectAndNumber: async () => issue,
		} as unknown as IssueDao,
		projectDao: {
			findById: async () =>
				archived ? { id: "project-1", archived: true } : { id: "project-1" },
		} as unknown as ProjectDao,
		commentDao: {
			create: async (
				data: Record<string, unknown>,
				activity: ActivityInsert,
			) => {
				calls.commented.push({ data, activity });
				return commentDto({ body: data.body as string });
			},
			findById: async () => comment,
			update: async (_orgId: string, _id: string, body: string) =>
				commentDto({ body }),
			delete: async () => true,
			listByIssue: async () => ({
				items: [commentDto()],
				total: 1,
				page: 1,
				pageSize: 20,
			}),
		} as unknown as CommentDao,
		webhooks: {
			dispatch: async (orgId: string, event: string, data: unknown) => {
				calls.dispatched.push({ orgId, event, data });
			},
		},
	});
	return { service, calls };
};

const isCommentError =
	(status: number, code: ApiErrorCode) => (error: unknown) =>
		error instanceof ApiError && error.status === status && error.code === code;

test("commenting on an archived project is rejected before writing", async () => {
	const { service, calls } = serviceFor({ archived: true });
	await assert.rejects(
		service.createComment("org", "project-1", 7, "author-1", { body: "Hi" }),
		isCommentError(409, ApiErrorCode.PROJECT_ARCHIVED),
	);
	assert.equal(calls.commented.length, 0);
});

test("commenting on an unknown issue answers 404", async () => {
	const { service } = serviceFor({ issue: null });
	await assert.rejects(
		service.createComment("org", "project-1", 7, "author-1", { body: "Hi" }),
		isCommentError(404, ApiErrorCode.ISSUE_NOT_FOUND),
	);
});

test("a created comment records its activity and dispatches the webhook", async () => {
	const { service, calls } = serviceFor();
	const created = await service.createComment(
		"org",
		"project-1",
		7,
		"author-1",
		{ body: "Looks good" },
	);
	assert.equal(created.body, "Looks good");

	const write = calls.commented[0];
	assert.ok(write);
	assert.equal(write.data.orgId, "org");
	assert.equal(write.data.issueId, "issue-1");
	assert.equal(write.data.authorId, "author-1");
	assert.equal(write.data.body, "Looks good");
	assert.ok(typeof write.data.id === "string" && write.data.id.length > 0);
	assert.equal(write.activity.action, "comment.created");
	assert.equal(write.activity.issueId, "issue-1");
	assert.equal(write.activity.actorId, "author-1");

	assert.deepEqual(calls.dispatched, [
		{
			orgId: "org",
			event: "comment.created",
			data: { comment: created, issueId: "issue-1", issueNumber: 7 },
		},
	]);
});

test("only the author can edit or delete a comment", async () => {
	const { service } = serviceFor({
		comment: commentDto({
			author: {
				id: "other",
				name: "Other",
				email: "other@example.com",
				image: null,
			},
		}),
	});
	await assert.rejects(
		service.updateComment("org", "project-1", 7, "comment-1", "author-1", {
			body: "Edit",
		}),
		isCommentError(403, ApiErrorCode.FORBIDDEN),
	);
	await assert.rejects(
		service.deleteComment("org", "project-1", 7, "comment-1", "author-1"),
		isCommentError(403, ApiErrorCode.FORBIDDEN),
	);
});

test("comments from other issues answer 404", async () => {
	const { service } = serviceFor({
		comment: commentDto({ issueId: "issue-2" }),
	});
	await assert.rejects(
		service.updateComment("org", "project-1", 7, "comment-1", "author-1", {
			body: "Edit",
		}),
		isCommentError(404, ApiErrorCode.COMMENT_NOT_FOUND),
	);
});
