import {
	ApiError,
	ApiErrorCode,
	createCommentSchema,
	createIssueSchema,
	createLabelSchema,
	createProjectSchema,
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
				"Create an issue in a project. Requires the project id; uses the organization's labels and members for labelIds and assigneeId.",
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
					summary: `Created issue #${issue.number}: ${issue.title}.`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "update_issue",
			titleKey: "ai.capabilities.update_issue.title",
			description: `Update issue fields (title, description, status, priority, assignee, labels, due date, estimate). ${issueRefDescription}`,
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
					summary: `Updated issue #${updated.number}: ${updated.title}.`,
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
