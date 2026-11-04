import {
	ApiError,
	ApiErrorCode,
	createCommentSchema,
	createIssueSchema,
	createLabelSchema,
	createProjectSchema,
	createViewSchema,
	ISSUE_RELATION_INPUT_TYPES,
	updateIssueSchema,
	updateLabelSchema,
} from "@workspace/shared";
import { z } from "zod";
import {
	commentSummarySchema,
	issueLink,
	issueRefShape,
	issueSummarySchema,
	labelSummarySchema,
	labelsLink,
	orgLink,
	projectLink,
	projectSummarySchema,
	resolveIssueRef,
	resolveRef,
	toCommentSummary,
	toIssueSummary,
	toLabelSummary,
	toProjectSummary,
	toViewSummary,
	viewSummarySchema,
} from "./read";
import {
	type CapabilityContext,
	type CapabilityDeps,
	defineCapability,
} from "./types";

const requireUserId = (ctx: CapabilityContext): string => {
	if (!ctx.actor.userId) {
		throw new ApiError(
			403,
			ApiErrorCode.FORBIDDEN,
			"A signed-in user is required for this action.",
		);
	}
	return ctx.actor.userId;
};

const issueRef = <T extends z.ZodRawShape>(shape: T) =>
	z.object({ ...issueRefShape, ...shape }).refine(
		(value) =>
			resolveRef(
				value as {
					issueId?: string;
					projectKey?: string;
					number?: number;
				},
			),
		{
			message: "Provide issueId, or projectKey together with number.",
		},
	);

const issueRefDescription =
	"Issue reference: either issueId, or the projectKey plus the issue number (e.g. WEB and 12).";

const createIssueInputSchema = createIssueSchema.extend({
	projectId: z.string().min(1),
});

const updateIssueInputSchema = issueRef(updateIssueSchema.shape);

const createCommentInputSchema = issueRef({
	body: createCommentSchema.shape.body,
});

const updateCommentInputSchema = issueRef({
	commentId: z.string().min(1),
	body: createCommentSchema.shape.body,
});

const deleteCommentInputSchema = issueRef({
	commentId: z.string().min(1),
});

const deleteIssueInputSchema = z.object(issueRefShape).refine(resolveRef, {
	message: "Provide issueId, or projectKey together with number.",
});

const linkIssuesInputSchema = issueRef({
	relatedIssueId: z.string().min(1),
	type: z.enum(ISSUE_RELATION_INPUT_TYPES),
});

const unlinkIssueInputSchema = issueRef({
	relationId: z.string().min(1),
});

const deletedOutputSchema = z.object({
	id: z.string(),
	deleted: z.boolean(),
});

const deleteLabelInputSchema = z.object({
	labelId: z.string().min(1),
});

const updateLabelInputSchema = updateLabelSchema.extend({
	labelId: z.string().min(1),
});

const deletedLinks = (
	ctx: CapabilityContext,
	orgId: string,
	projectId: string,
) => [projectLink(ctx, orgId, projectId)];

export const createWriteCapabilities = (deps: CapabilityDeps) =>
	[
		defineCapability({
			name: "create_issue",
			titleKey: "ai.capabilities.create_issue.title",
			description:
				"Create an issue in a project. Requires the project id; uses the organization's labels and members for labelIds and assigneeId. Pass statusId (preferred) or a legacy status name; defaults to the organization's default status. Pass parentId to create a sub-issue: the parent must be a top-level issue in the same project (sub-issues are two levels deep).",
			input: createIssueInputSchema,
			output: z.object({ issue: issueSummarySchema }),
			effect: "write",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const { projectId, ...createInput } = input;
				const issue = await deps.services.issueService.createIssue(
					orgId,
					projectId,
					ctx.actor.userId ?? null,
					createInput,
					ctx.background,
				);
				return {
					data: { issue: toIssueSummary(issue) },
					summary: `Created issue #${issue.number}: ${issue.title} (status: ${issue.status.name}).`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "update_issue",
			titleKey: "ai.capabilities.update_issue.title",
			description: `Update issue fields (title, description, statusId (or legacy status name), priority, assignee, labels, due date, estimate, parentId). parentId moves the issue under a top-level issue in the same project; pass parentId: null to detach it. Issues that already have sub-issues cannot become sub-issues (two levels max). ${issueRefDescription}`,
			input: updateIssueInputSchema,
			output: z.object({ issue: issueSummarySchema }),
			effect: "write",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				const { issueId, projectKey, number, ...patch } = input;
				void issueId;
				void projectKey;
				void number;
				const updated = await deps.services.issueService.updateIssue(
					orgId,
					issue.projectId,
					issue.number,
					ctx.actor.userId ?? null,
					patch,
					ctx.background,
				);
				return {
					data: { issue: toIssueSummary(updated) },
					summary: `Updated issue #${updated.number}: ${updated.title} (status: ${updated.status.name}).`,
					links: [issueLink(ctx, orgId, updated.projectId, updated.number)],
				};
			},
		}),

		defineCapability({
			name: "delete_issue",
			titleKey: "ai.capabilities.delete_issue.title",
			description: `Soft-delete an issue. This is destructive; confirm with the user before calling. ${issueRefDescription}`,
			input: deleteIssueInputSchema,
			output: deletedOutputSchema,
			effect: "destructive",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				await deps.services.issueService.deleteIssue(
					orgId,
					issue.projectId,
					issue.number,
					ctx.actor.userId ?? null,
					ctx.background,
				);
				return {
					data: { id: issue.id, deleted: true },
					summary: `Deleted issue #${issue.number}: ${issue.title}.`,
					links: deletedLinks(ctx, orgId, issue.projectId),
				};
			},
		}),

		defineCapability({
			name: "link_issues",
			titleKey: "ai.capabilities.link_issues.title",
			description: `Link two issues in the same project. type is blocks (this issue blocks the related one; the link is rejected if it would close a blocking cycle), blocked_by (the related issue blocks this one), related (symmetric) or duplicates (symmetric: both issues are marked as duplicates of each other). ${issueRefDescription}`,
			input: linkIssuesInputSchema,
			output: z.object({
				relation: z.object({
					id: z.string(),
					type: z.string(),
					issueId: z.string(),
					relatedIssueId: z.string(),
				}),
			}),
			effect: "write",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				const relation = await deps.services.relationService.createRelation(
					orgId,
					issue.projectId,
					issue.number,
					ctx.actor.userId ?? null,
					{ relatedIssueId: input.relatedIssueId, type: input.type },
					ctx.background,
				);
				return {
					data: {
						relation: {
							id: relation.id,
							type: relation.type,
							issueId: relation.issueId,
							relatedIssueId: relation.relatedIssueId,
						},
					},
					summary: `Linked issue #${issue.number} (${input.type}).`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "unlink_issue",
			titleKey: "ai.capabilities.unlink_issue.title",
			description: `Remove one of the issue's relations by relation id (see list_issue_relations). This is destructive; confirm with the user before calling. ${issueRefDescription}`,
			input: unlinkIssueInputSchema,
			output: deletedOutputSchema,
			effect: "destructive",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				await deps.services.relationService.deleteRelation(
					orgId,
					issue.projectId,
					issue.number,
					ctx.actor.userId ?? null,
					input.relationId,
					ctx.background,
				);
				return {
					data: { id: input.relationId, deleted: true },
					summary: `Removed relation ${input.relationId} from issue #${issue.number}.`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "create_comment",
			titleKey: "ai.capabilities.create_comment.title",
			description: `Add a comment to an issue as the signed-in user. ${issueRefDescription}`,
			input: createCommentInputSchema,
			output: z.object({ comment: commentSummarySchema }),
			effect: "write",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const userId = requireUserId(ctx);
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				const comment = await deps.services.commentService.createComment(
					orgId,
					issue.projectId,
					issue.number,
					userId,
					{ body: input.body },
					ctx.background,
				);
				return {
					data: { comment: toCommentSummary(comment) },
					summary: `Added a comment to issue #${issue.number}.`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "update_comment",
			titleKey: "ai.capabilities.update_comment.title",
			description: `Edit one of the signed-in user's comments. ${issueRefDescription}`,
			input: updateCommentInputSchema,
			output: z.object({ comment: commentSummarySchema }),
			effect: "write",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const userId = requireUserId(ctx);
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				const comment = await deps.services.commentService.updateComment(
					orgId,
					issue.projectId,
					issue.number,
					input.commentId,
					userId,
					{ body: input.body },
				);
				return {
					data: { comment: toCommentSummary(comment) },
					summary: `Updated comment ${comment.id} on issue #${issue.number}.`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "delete_comment",
			titleKey: "ai.capabilities.delete_comment.title",
			description: `Delete one of the signed-in user's comments. This is destructive; confirm with the user before calling. ${issueRefDescription}`,
			input: deleteCommentInputSchema,
			output: deletedOutputSchema,
			effect: "destructive",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const userId = requireUserId(ctx);
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				await deps.services.commentService.deleteComment(
					orgId,
					issue.projectId,
					issue.number,
					input.commentId,
					userId,
				);
				return {
					data: { id: input.commentId, deleted: true },
					summary: `Deleted comment ${input.commentId} on issue #${issue.number}.`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "create_view",
			titleKey: "ai.capabilities.create_view.title",
			description:
				"Save a reusable issue view for the organization. Provide a name, an optional description and project scope (projectId; omit it for an organization-wide view), plus the query: a filter tree (fields statusId, priority, assigneeId, createdById, labelId, projectId, dueDate, createdAt, updatedAt, estimate with eq/neq/in/notIn/isNull/isNotNull/contains/before/after/between/gt/lt/gte/lte), an optional sort array, groupBy and layout. Personal views are private to the caller and limited by the plan; shared views are visible to every member and require an organization owner/admin.",
			input: createViewSchema,
			output: z.object({ view: viewSummarySchema }),
			effect: "write",
			scopes: ["write"],
			execute: async (ctx, input) => {
				const userId = requireUserId(ctx);
				const orgId = ctx.orgId as string;
				const view = await deps.services.viewService.createView(
					orgId,
					userId,
					ctx.actor.role ?? "member",
					input,
				);
				return {
					data: { view: toViewSummary(view) },
					summary: `Created ${view.shared ? "shared" : "personal"} view "${view.name}".`,
					links: [
						view.projectId
							? projectLink(ctx, orgId, view.projectId)
							: orgLink(ctx, orgId),
					],
				};
			},
		}),

		defineCapability({
			name: "create_project",
			titleKey: "ai.capabilities.create_project.title",
			description:
				"Create a project in the organization. Requires an organization owner/admin.",
			input: createProjectSchema,
			output: z.object({ project: projectSummarySchema }),
			effect: "write",
			scopes: ["admin"],
			minOrgRole: "admin",
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const project = await deps.services.projectService.createProject(
					orgId,
					input,
				);
				return {
					data: { project: toProjectSummary(project) },
					summary: `Created project ${project.key}: ${project.name}.`,
					links: [projectLink(ctx, orgId, project.id)],
				};
			},
		}),

		defineCapability({
			name: "create_label",
			titleKey: "ai.capabilities.create_label.title",
			description:
				"Create an organization label. Requires an organization owner/admin.",
			input: createLabelSchema,
			output: z.object({ label: labelSummarySchema }),
			effect: "write",
			scopes: ["admin"],
			minOrgRole: "admin",
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const label = await deps.services.labelService.createLabel(
					orgId,
					input,
				);
				return {
					data: { label: toLabelSummary(label) },
					summary: `Created label "${label.name}".`,
					links: [labelsLink(ctx, orgId)],
				};
			},
		}),

		defineCapability({
			name: "update_label",
			titleKey: "ai.capabilities.update_label.title",
			description:
				"Rename or recolor an organization label. Requires an organization owner/admin.",
			input: updateLabelInputSchema,
			output: z.object({ label: labelSummarySchema }),
			effect: "write",
			scopes: ["admin"],
			minOrgRole: "admin",
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const { labelId, ...patch } = input;
				const label = await deps.services.labelService.updateLabel(
					orgId,
					labelId,
					patch,
				);
				return {
					data: { label: toLabelSummary(label) },
					summary: `Updated label "${label.name}".`,
					links: [labelsLink(ctx, orgId)],
				};
			},
		}),

		defineCapability({
			name: "delete_label",
			titleKey: "ai.capabilities.delete_label.title",
			description:
				"Delete an organization label that is not used by any issue. This is destructive; confirm first. Requires an organization owner/admin.",
			input: deleteLabelInputSchema,
			output: deletedOutputSchema,
			effect: "destructive",
			scopes: ["admin"],
			minOrgRole: "admin",
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				await deps.services.labelService.deleteLabel(orgId, input.labelId);
				return {
					data: { id: input.labelId, deleted: true },
					summary: `Deleted label ${input.labelId}.`,
					links: [labelsLink(ctx, orgId), orgLink(ctx, orgId)],
				};
			},
		}),
	] as const;

export type WriteCapability = ReturnType<
	typeof createWriteCapabilities
>[number];
