import {
	ApiError,
	ApiErrorCode,
	ISSUE_PRIORITY,
	ISSUE_STATUSES,
} from "@workspace/shared";
import { z } from "zod";
import type { ActivityDto, OrgActivityDto } from "../dto/activity.dto";
import type { CommentDto } from "../dto/comment.dto";
import type { IssueDetailDto } from "../dto/issue.dto";
import type { LabelDto } from "../dto/label.dto";
import type { ProjectWithStatsDto } from "../dto/project.dto";
import type { StatusDto } from "../dto/status.dto";
import {
	type CapabilityContext,
	type CapabilityDeps,
	type CapabilityLink,
	defineCapability,
} from "./types";

// ---------------------------------------------------------------------------
// Safe projections / output schemas
// ---------------------------------------------------------------------------

export const orgSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	frozen: z.boolean(),
	plan: z.string().optional(),
	role: z.string().optional(),
});

export const memberSummarySchema = z.object({
	userId: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
	role: z.string(),
	joinedAt: z.string(),
});

export const projectSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	key: z.string(),
	description: z.string().nullable(),
	color: z.string().nullable(),
	archived: z.boolean(),
	nextNumber: z.number().int(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const statusSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string(),
	color: z.string(),
	position: z.number().int(),
	isDefault: z.boolean(),
});

export const issueSummarySchema = z.object({
	id: z.string(),
	projectId: z.string(),
	number: z.number().int(),
	title: z.string(),
	description: z.string().nullable(),
	statusId: z.string(),
	status: statusSummarySchema,
	/** Convenience copy of `status.name` for model/tool output. */
	statusName: z.string(),
	priority: z.number().int(),
	assigneeId: z.string().nullable(),
	dueDate: z.string().nullable(),
	estimate: z.number().int().nullable(),
	labelIds: z.array(z.string()),
	parentId: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const commentSummarySchema = z.object({
	id: z.string(),
	issueId: z.string(),
	body: z.string(),
	author: z.object({
		id: z.string(),
		name: z.string(),
		image: z.string().nullable(),
	}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const labelSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
});

export const relatedIssueSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	number: z.number().int(),
	title: z.string(),
	statusId: z.string(),
	statusName: z.string(),
	status: statusSummarySchema,
	priority: z.number().int(),
});

export const issueRelationSummarySchema = z.object({
	/** Relation row id, used by unlink_issue. */
	id: z.string(),
	type: z.string(),
	issue: relatedIssueSchema,
});

export const activitySummarySchema = z.object({
	id: z.string(),
	action: z.string(),
	field: z.string().nullable(),
	oldValue: z.string().nullable(),
	newValue: z.string().nullable(),
	actor: z.object({ id: z.string(), name: z.string() }),
	createdAt: z.string(),
	issue: z
		.object({ id: z.string(), number: z.number().int(), title: z.string() })
		.nullable()
		.optional(),
	project: z
		.object({ id: z.string(), key: z.string(), name: z.string() })
		.nullable()
		.optional(),
});

const pageMetaSchema = {
	total: z.number().int(),
	page: z.number().int(),
	pageSize: z.number().int(),
};

const issuesOutputSchema = z.object({
	items: z.array(issueSummarySchema),
	...pageMetaSchema,
});

const commentsOutputSchema = z.object({
	comments: z.array(commentSummarySchema),
	...pageMetaSchema,
});

type OrgSummary = z.infer<typeof orgSummarySchema>;
type MemberSummary = z.infer<typeof memberSummarySchema>;
type ProjectSummary = z.infer<typeof projectSummarySchema>;
type IssueSummary = z.infer<typeof issueSummarySchema>;
type CommentSummary = z.infer<typeof commentSummarySchema>;
type LabelSummary = z.infer<typeof labelSummarySchema>;
type StatusSummary = z.infer<typeof statusSummarySchema>;
type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const toOrgSummary = (
	org: {
		id: string;
		name: string;
		slug: string;
		frozen: boolean;
		plan?: string;
	},
	role?: string,
): OrgSummary => ({
	id: org.id,
	name: org.name,
	slug: org.slug,
	frozen: org.frozen,
	...(org.plan ? { plan: org.plan } : {}),
	...(role ? { role } : {}),
});

export const toProjectSummary = (
	project:
		| ProjectWithStatsDto
		| {
				id: string;
				name: string;
				key: string;
				description: string | null;
				color: string | null;
				archived: boolean;
				nextNumber: number;
				createdAt: string;
				updatedAt: string;
		  },
): ProjectSummary => ({
	id: project.id,
	name: project.name,
	key: project.key,
	description: project.description,
	color: project.color,
	archived: project.archived,
	nextNumber: project.nextNumber,
	createdAt: project.createdAt,
	updatedAt: project.updatedAt,
});

export const toIssueSummary = (issue: IssueDetailDto): IssueSummary => ({
	id: issue.id,
	projectId: issue.projectId,
	number: issue.number,
	title: issue.title,
	description: issue.description,
	statusId: issue.statusId,
	status: issue.status,
	statusName: issue.status.name,
	priority: issue.priority,
	assigneeId: issue.assigneeId,
	dueDate: issue.dueDate,
	estimate: issue.estimate,
	labelIds: issue.labelIds,
	parentId: issue.parentId,
	createdAt: issue.createdAt,
	updatedAt: issue.updatedAt,
});

export const toCommentSummary = (comment: CommentDto): CommentSummary => ({
	id: comment.id,
	issueId: comment.issueId,
	body: comment.body,
	author: {
		id: comment.author.id,
		name: comment.author.name,
		image: comment.author.image,
	},
	createdAt: comment.createdAt,
	updatedAt: comment.updatedAt,
});

export const toLabelSummary = (label: LabelDto): LabelSummary => ({
	id: label.id,
	name: label.name,
	color: label.color,
});

export const toStatusSummary = (status: StatusDto): StatusSummary => ({
	id: status.id,
	name: status.name,
	category: status.category,
	color: status.color,
	position: status.position,
	isDefault: status.isDefault,
});

export const toIssueActivitySummary = (
	activity: ActivityDto | OrgActivityDto,
): ActivitySummary => ({
	id: activity.id,
	action: activity.action,
	field: activity.field,
	oldValue: activity.oldValue,
	newValue: activity.newValue,
	actor: { id: activity.actor.id, name: activity.actor.name },
	createdAt: activity.createdAt,
	...(("issue" in activity && activity.issue
		? { issue: activity.issue }
		: {}) as Pick<ActivitySummary, "issue">),
	...(("project" in activity && activity.project
		? { project: activity.project }
		: {}) as Pick<ActivitySummary, "project">),
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const baseUrl = (ctx: CapabilityContext) => ctx.webBaseUrl.replace(/\/+$/, "");

const segment = (value: string) => encodeURIComponent(value);

export const orgLink = (
	ctx: CapabilityContext,
	orgId: string,
): CapabilityLink => ({
	labelKey: "ai.links.org",
	url: `${baseUrl(ctx)}/orgs/${segment(orgId)}`,
});

export const projectLink = (
	ctx: CapabilityContext,
	orgId: string,
	projectId: string,
): CapabilityLink => ({
	labelKey: "ai.links.project",
	url: `${baseUrl(ctx)}/orgs/${segment(orgId)}/projects/${segment(projectId)}`,
});

export const issueLink = (
	ctx: CapabilityContext,
	orgId: string,
	projectId: string,
	number: number,
): CapabilityLink => ({
	labelKey: "ai.links.issue",
	url: `${baseUrl(ctx)}/orgs/${segment(orgId)}/projects/${segment(projectId)}/${number}`,
});

export const labelsLink = (
	ctx: CapabilityContext,
	orgId: string,
): CapabilityLink => ({
	labelKey: "ai.links.labels",
	url: `${baseUrl(ctx)}/orgs/${segment(orgId)}/settings/labels`,
});

export const statusesLink = (
	ctx: CapabilityContext,
	orgId: string,
): CapabilityLink => ({
	labelKey: "ai.links.statuses",
	url: `${baseUrl(ctx)}/orgs/${segment(orgId)}/settings/statuses`,
});

const uniqueLinks = (links: CapabilityLink[]): CapabilityLink[] => [
	...new Map(links.map((link) => [link.url, link])).values(),
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const issueRefShape = {
	issueId: z.string().min(1).optional(),
	projectKey: z.string().trim().min(1).max(16).optional(),
	number: z.number().int().min(1).optional(),
};

export const resolveRef = (value: {
	issueId?: string;
	projectKey?: string;
	number?: number;
}) =>
	Boolean(value.issueId) ||
	(Boolean(value.projectKey) && typeof value.number === "number");

const issueRefObjectSchema = z.object(issueRefShape);

export const issueRefSchema = issueRefObjectSchema.refine(resolveRef, {
	message: "Provide issueId, or projectKey together with number.",
});

export const paginationInputShape = {
	page: z.number().int().min(1).max(10_000).default(1),
	pageSize: z.number().int().min(1).max(50).default(20),
};

const issueRefWithPaginationSchema = z
	.object({ ...issueRefShape, ...paginationInputShape })
	.refine(resolveRef, {
		message: "Provide issueId, or projectKey together with number.",
	});

const listIssuesInputSchema = z.object({
	projectId: z.string().min(1).optional(),
	/** Preferred filter: organization status ids. */
	statusId: z.array(z.string().min(1)).optional(),
	/** @deprecated Legacy status names; the service maps them to ids. */
	status: z.array(z.enum(ISSUE_STATUSES)).optional(),
	priority: z
		.array(z.number().int().min(ISSUE_PRIORITY.none).max(ISSUE_PRIORITY.low))
		.optional(),
	assigneeId: z.string().min(1).optional(),
	labelId: z.string().min(1).optional(),
	search: z.string().trim().max(100).optional(),
	...paginationInputShape,
	sort: z.enum(["updated", "created", "priority"]).default("updated"),
});

type IssueRefInput = z.infer<typeof issueRefSchema>;

export const resolveIssueRef = async (
	deps: CapabilityDeps,
	orgId: string,
	ref: IssueRefInput,
): Promise<IssueDetailDto> => {
	if (ref.issueId) {
		return deps.services.issueService.getIssueById(orgId, ref.issueId);
	}
	if (!ref.projectKey || ref.number === undefined) {
		throw new ApiError(
			400,
			ApiErrorCode.VALIDATION,
			"Provide issueId, or projectKey together with number.",
		);
	}
	const project = await deps.daos.projectDao.findByKey(orgId, ref.projectKey);
	if (!project) {
		throw new ApiError(
			404,
			ApiErrorCode.PROJECT_NOT_FOUND,
			`Project ${ref.projectKey} not found`,
		);
	}
	return deps.services.issueService.getIssue(orgId, project.id, ref.number);
};

const issueRefDescription =
	"Issue reference: either issueId, or the projectKey plus the issue number (e.g. WEB and 12).";

const listIssuesQuery = (
	orgId: string,
	deps: CapabilityDeps,
	input: z.infer<typeof listIssuesInputSchema>,
) =>
	deps.services.issueService.listIssues(orgId, input.projectId ?? null, input);

const buildListIssuesCapability = (deps: CapabilityDeps) =>
	defineCapability({
		name: "list_issues",
		titleKey: "ai.capabilities.list_issues.title",
		description:
			"List issues in the organization, optionally filtered by project, workflow status (statusId; the legacy status name is also accepted), priority, assignee, label or free-text search. Returns paginated results newest first.",
		input: listIssuesInputSchema,
		output: issuesOutputSchema,
		effect: "read",
		scopes: ["read"],
		execute: async (ctx, input) => {
			const orgId = ctx.orgId as string;
			const page = await listIssuesQuery(orgId, deps, input);
			return {
				data: {
					items: page.items.map(toIssueSummary),
					total: page.total,
					page: page.page,
					pageSize: page.pageSize,
				},
				summary: `Found ${page.total} issue(s); showing page ${page.page}.`,
				links: uniqueLinks(
					page.items.map((issue) =>
						issueLink(ctx, orgId, issue.projectId, issue.number),
					),
				),
			};
		},
	});

export const createReadCapabilities = (deps: CapabilityDeps) =>
	[
		defineCapability({
			name: "list_orgs",
			titleKey: "ai.capabilities.list_orgs.title",
			description:
				"List the organizations the signed-in user belongs to. API keys only see the organization they were issued for.",
			input: z.object({}),
			output: z.object({ orgs: z.array(orgSummarySchema) }),
			effect: "read",
			scopes: ["read"],
			orgScoped: false,
			execute: async (ctx) => {
				let orgs: OrgSummary[];
				// API keys are pinned to their organization. Even when the key
				// records its creator, it must not enumerate their other orgs.
				if (ctx.actor.keyId) {
					if (!ctx.orgId) {
						throw new ApiError(
							400,
							ApiErrorCode.MCP_ORG_REQUIRED,
							"An organization is required for API key access.",
						);
					}
					const org = await deps.daos.organizationDao.findById(ctx.orgId);
					if (!org) {
						throw new ApiError(
							404,
							ApiErrorCode.NOT_FOUND,
							"Organization not found",
						);
					}
					orgs = [toOrgSummary(org)];
				} else if (ctx.actor.userId) {
					const memberships = await deps.daos.memberDao.listMembershipsByUser(
						ctx.actor.userId,
					);
					orgs = memberships.map((membership) =>
						toOrgSummary(membership, membership.role),
					);
				} else if (ctx.orgId) {
					const org = await deps.daos.organizationDao.findById(ctx.orgId);
					if (!org) {
						throw new ApiError(
							404,
							ApiErrorCode.NOT_FOUND,
							"Organization not found",
						);
					}
					orgs = [toOrgSummary(org)];
				} else {
					throw new ApiError(
						400,
						ApiErrorCode.MCP_ORG_REQUIRED,
						"An organization is required for API key access.",
					);
				}
				return {
					data: { orgs },
					summary: `Found ${orgs.length} organization(s).`,
					links: orgs.map((org) => orgLink(ctx, org.id)),
				};
			},
		}),

		defineCapability({
			name: "get_org",
			titleKey: "ai.capabilities.get_org.title",
			description:
				"Get the current organization's name, slug, plan and frozen status.",
			input: z.object({}),
			output: z.object({ org: orgSummarySchema }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx) => {
				const orgId = ctx.orgId as string;
				const org = await deps.daos.organizationDao.findById(orgId);
				if (!org) {
					throw new ApiError(
						404,
						ApiErrorCode.NOT_FOUND,
						"Organization not found",
					);
				}
				const summary = toOrgSummary(org);
				return {
					data: { org: summary },
					summary: `Organization ${summary.name} (${summary.slug}).`,
					links: [orgLink(ctx, orgId)],
				};
			},
		}),

		defineCapability({
			name: "list_members",
			titleKey: "ai.capabilities.list_members.title",
			description:
				"List the members of the current organization with their roles. Use member user ids as assigneeId values.",
			input: z.object({}),
			output: z.object({ members: z.array(memberSummarySchema) }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx) => {
				const orgId = ctx.orgId as string;
				const rows = await deps.daos.memberDao.listByOrg(orgId);
				const members: MemberSummary[] = rows.map((row) => ({
					userId: row.userId,
					name: row.name,
					email: row.email,
					image: row.image,
					role: row.role,
					joinedAt: row.createdAt.toISOString(),
				}));
				return {
					data: { members },
					summary: `The organization has ${members.length} member(s).`,
					links: [orgLink(ctx, orgId)],
				};
			},
		}),

		defineCapability({
			name: "list_projects",
			titleKey: "ai.capabilities.list_projects.title",
			description:
				"List projects in the organization, including archived state and issue counts.",
			input: z.object({
				includeArchived: z.boolean().default(false),
			}),
			output: z.object({
				projects: z.array(
					projectSummarySchema.extend({
						openIssueCount: z.number().int(),
						totalIssueCount: z.number().int(),
					}),
				),
			}),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const projects = await deps.services.projectService.listProjects(
					orgId,
					{ includeArchived: input.includeArchived },
				);
				return {
					data: {
						projects: projects.map((project) => ({
							...toProjectSummary(project),
							openIssueCount: project.openIssueCount,
							totalIssueCount: project.totalIssueCount,
						})),
					},
					summary: `Found ${projects.length} project(s).`,
					links: projects.map((project) => projectLink(ctx, orgId, project.id)),
				};
			},
		}),

		defineCapability({
			name: "get_project",
			titleKey: "ai.capabilities.get_project.title",
			description: "Get a project by its id, including its key and status.",
			input: z.object({ projectId: z.string().min(1) }),
			output: z.object({ project: projectSummarySchema }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const project = await deps.services.projectService.getProject(
					orgId,
					input.projectId,
				);
				return {
					data: { project: toProjectSummary(project) },
					summary: `Project ${project.key}: ${project.name}.`,
					links: [projectLink(ctx, orgId, project.id)],
				};
			},
		}),

		buildListIssuesCapability(deps),

		defineCapability({
			name: "search_issues",
			titleKey: "ai.capabilities.search_issues.title",
			description:
				"Search issues by free text across title and description. Supports the same filters and pagination as list_issues.",
			input: listIssuesInputSchema.extend({
				search: z.string().trim().min(1).max(100),
			}),
			output: issuesOutputSchema,
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const page = await listIssuesQuery(orgId, deps, input);
				return {
					data: {
						items: page.items.map(toIssueSummary),
						total: page.total,
						page: page.page,
						pageSize: page.pageSize,
					},
					summary: `Found ${page.total} issue(s) matching "${input.search}".`,
					links: uniqueLinks(
						page.items.map((issue) =>
							issueLink(ctx, orgId, issue.projectId, issue.number),
						),
					),
				};
			},
		}),

		defineCapability({
			name: "get_issue",
			titleKey: "ai.capabilities.get_issue.title",
			description: `Get a single issue with its labels and description. ${issueRefDescription}`,
			input: issueRefSchema,
			output: z.object({ issue: issueSummarySchema }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				return {
					data: { issue: toIssueSummary(issue) },
					summary: `Issue #${issue.number}: ${issue.title}.`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "list_issue_relations",
			titleKey: "ai.capabilities.list_issue_relations.title",
			description: `List the issue's relations: blocks and blockedBy are the two sides of directed blocking links, while related and duplicates are symmetric groups (the same link appears for both issues). Each entry includes the relation id, stored type and the other issue. ${issueRefDescription}`,
			input: issueRefSchema,
			output: z.object({
				blocks: z.array(issueRelationSummarySchema),
				blockedBy: z.array(issueRelationSummarySchema),
				related: z.array(issueRelationSummarySchema),
				duplicates: z.array(issueRelationSummarySchema),
			}),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				const relations = await deps.services.relationService.listRelations(
					orgId,
					issue.projectId,
					issue.number,
				);
				const toSummary = (
					link: (typeof relations)["blocks"][number],
				): z.infer<typeof issueRelationSummarySchema> => ({
					id: link.id,
					type: link.type,
					issue: {
						id: link.issue.id,
						projectId: link.issue.projectId,
						number: link.issue.number,
						title: link.issue.title,
						statusId: link.issue.statusId,
						statusName: link.issue.status.name,
						status: link.issue.status,
						priority: link.issue.priority,
					},
				});
				const total =
					relations.blocks.length +
					relations.blockedBy.length +
					relations.related.length +
					relations.duplicates.length;
				return {
					data: {
						blocks: relations.blocks.map(toSummary),
						blockedBy: relations.blockedBy.map(toSummary),
						related: relations.related.map(toSummary),
						duplicates: relations.duplicates.map(toSummary),
					},
					summary: `Issue #${issue.number} has ${total} relation(s).`,
					links: [
						issueLink(ctx, orgId, issue.projectId, issue.number),
						...[
							...relations.blocks,
							...relations.blockedBy,
							...relations.related,
							...relations.duplicates,
						].map((link) =>
							issueLink(ctx, orgId, link.issue.projectId, link.issue.number),
						),
					],
				};
			},
		}),

		defineCapability({
			name: "list_comments",
			titleKey: "ai.capabilities.list_comments.title",
			description: `List comments on an issue, oldest first. ${issueRefDescription}`,
			input: issueRefWithPaginationSchema,
			output: commentsOutputSchema,
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				const page = await deps.services.commentService.listComments(
					orgId,
					issue.projectId,
					issue.number,
					{ page: input.page, pageSize: input.pageSize },
				);
				return {
					data: {
						comments: page.items.map(toCommentSummary),
						total: page.total,
						page: page.page,
						pageSize: page.pageSize,
					},
					summary: `Issue #${issue.number} has ${page.total} comment(s).`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "list_labels",
			titleKey: "ai.capabilities.list_labels.title",
			description:
				"List the organization's labels with their ids, names and colors.",
			input: z.object({}),
			output: z.object({ labels: z.array(labelSummarySchema) }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx) => {
				const orgId = ctx.orgId as string;
				const labels = await deps.services.labelService.listLabels(orgId);
				return {
					data: { labels: labels.map(toLabelSummary) },
					summary: `Found ${labels.length} label(s).`,
					links: [labelsLink(ctx, orgId)],
				};
			},
		}),

		defineCapability({
			name: "list_statuses",
			titleKey: "ai.capabilities.list_statuses.title",
			description:
				"List the organization's workflow statuses in board order. Each status has an id, name, category (backlog/unstarted/started/completed/canceled), color, position and isDefault flag. Use the status id as statusId for issue filters and writes.",
			input: z.object({}),
			output: z.object({ statuses: z.array(statusSummarySchema) }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx) => {
				const orgId = ctx.orgId as string;
				const statuses = await deps.services.statusService.listStatuses(orgId);
				return {
					data: { statuses: statuses.map(toStatusSummary) },
					summary: `Found ${statuses.length} workflow status(es).`,
					links: [statusesLink(ctx, orgId)],
				};
			},
		}),

		defineCapability({
			name: "get_issue_activity",
			titleKey: "ai.capabilities.get_issue_activity.title",
			description: `List the change history of an issue, oldest first. ${issueRefDescription}`,
			input: issueRefSchema,
			output: z.object({ activities: z.array(activitySummarySchema) }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const issue = await resolveIssueRef(deps, orgId, input);
				const activities = await deps.services.activityService.listByIssue(
					orgId,
					issue.projectId,
					issue.number,
				);
				return {
					data: { activities: activities.map(toIssueActivitySummary) },
					summary: `Issue #${issue.number} has ${activities.length} activity entr(ies).`,
					links: [issueLink(ctx, orgId, issue.projectId, issue.number)],
				};
			},
		}),

		defineCapability({
			name: "get_org_activity",
			titleKey: "ai.capabilities.get_org_activity.title",
			description:
				"List the most recent activity across the organization, optionally limited to one project.",
			input: z.object({
				projectId: z.string().min(1).optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
			output: z.object({ activities: z.array(activitySummarySchema) }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const activities = await deps.services.activityService.listByOrg(
					orgId,
					{ projectId: input.projectId, limit: input.limit },
				);
				return {
					data: { activities: activities.map(toIssueActivitySummary) },
					summary: `Found ${activities.length} recent activity entr(ies).`,
					links: uniqueLinks([
						orgLink(ctx, orgId),
						...activities.flatMap((activity) =>
							activity.issue && activity.project
								? [
										issueLink(
											ctx,
											orgId,
											activity.project.id,
											activity.issue.number,
										),
									]
								: [],
						),
					]),
				};
			},
		}),
	] as const;

export type ReadCapability = ReturnType<typeof createReadCapabilities>[number];
