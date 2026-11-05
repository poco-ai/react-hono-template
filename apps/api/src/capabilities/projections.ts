import {
	ApiError,
	ApiErrorCode,
	ISSUE_PRIORITY,
	ISSUE_QUERY_GROUP_BY,
	ISSUE_QUERY_MAX_SORTS,
	ISSUE_STATUSES,
	issueFilterNodeSchema,
	issueQuerySchema,
	issueQuerySortSchema,
} from "@workspace/shared";
import { z } from "zod";
import type { ActivityDto, OrgActivityDto } from "../dto/activity.dto";
import type { CommentDto } from "../dto/comment.dto";
import type { IssueDetailDto } from "../dto/issue.dto";
import type { LabelDto } from "../dto/label.dto";
import type { ProjectWithStatsDto } from "../dto/project.dto";
import type { ProjectUpdateDto } from "../dto/project-update.dto";
import type { StatusDto } from "../dto/status.dto";
import type { ViewDto } from "../dto/view.dto";
import type {
	CapabilityContext,
	CapabilityDeps,
	CapabilityLink,
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
	health: z.string().nullable(),
	targetDate: z.string().nullable(),
	leadId: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const cycleSummarySchema = z.object({
	id: z.string(),
	projectId: z.string(),
	name: z.string(),
	number: z.number().int(),
	startsAt: z.string(),
	endsAt: z.string(),
	status: z.enum(["upcoming", "current", "past"]),
	progress: z.object({
		total: z.number().int(),
		terminal: z.number().int(),
		percent: z.number().int(),
	}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const projectUpdateSummarySchema = z.object({
	id: z.string(),
	projectId: z.string(),
	body: z.string(),
	health: z.string().nullable(),
	author: z
		.object({
			id: z.string(),
			name: z.string(),
			email: z.string(),
			image: z.string().nullable(),
		})
		.nullable(),
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
	cycleId: z.string().nullable(),
	/** Set while archived; archived issues stay editable but are hidden from lists. */
	archivedAt: z.string().nullable().optional(),
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
	/** Reply target; null for top-level comments. Optional for compatibility. */
	parentId: z.string().nullable().optional(),
	/** Set on resolved top-level threads. Optional for compatibility. */
	resolvedAt: z.string().nullable().optional(),
	mentions: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
	reactions: z
		.array(z.object({ emoji: z.string(), count: z.number().int() }))
		.optional(),
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

export const viewSummarySchema = z.object({
	id: z.string(),
	orgId: z.string(),
	projectId: z.string().nullable(),
	name: z.string(),
	description: z.string().nullable(),
	ownerId: z.string(),
	shared: z.boolean(),
	isDefault: z.boolean(),
	layout: z.string(),
	query: issueQuerySchema,
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const searchUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Search output schemas (strict AI/MCP contract)
//
// The schemas below are the output contract checked by the capability executor
// for `search_all`: every field is required (nullable only where the wire may
// carry null), with no coercion, no defaults and no per-hit recovery. A payload that
// drifts (missing field, wrong type) therefore fails loudly instead of reaching
// a model/MCP client with silently fabricated values.
//
// `@workspace/shared` exports a second, deliberately lenient
// `searchResultsSchema` (packages/shared/src/schemas/search.ts) used by the web
// command palette: it coerces numbers, fills defaults, generates identifiers
// and drops malformed hits so an older or partial payload still renders.
//
// Do not interchange them. Using the lenient schema here would mask API bugs
// (missing fields would quietly become ""/0/null); using the strict schema in
// the palette would fail whole responses on one partially valid hit.
// apps/api/tests/capability-search-schema.test.ts pins the shared field shape
// and the intentional fallback difference between the two.
// ---------------------------------------------------------------------------

export const searchIssueHitSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	projectKey: z.string(),
	number: z.number().int(),
	/** Human-readable reference, e.g. WEB-12. */
	identifier: z.string(),
	title: z.string(),
	descriptionExcerpt: z.string().nullable(),
	statusId: z.string(),
	statusName: z.string(),
	statusColor: z.string(),
	statusCategory: z.string(),
	priority: z.number().int(),
	assignee: searchUserSchema.nullable(),
	updatedAt: z.string(),
});

export const searchCommentHitSchema = z.object({
	id: z.string(),
	body: z.string(),
	author: searchUserSchema,
	issue: z.object({
		id: z.string(),
		projectId: z.string(),
		projectKey: z.string(),
		number: z.number().int(),
		identifier: z.string(),
		title: z.string(),
	}),
	createdAt: z.string(),
});

export const searchProjectHitSchema = z.object({
	id: z.string(),
	name: z.string(),
	key: z.string(),
	descriptionExcerpt: z.string().nullable(),
	color: z.string().nullable(),
	archived: z.boolean(),
	updatedAt: z.string(),
});

/** Members are matched by name/email but never expose their email address. */
export const searchMemberHitSchema = searchUserSchema;

export const searchResultsSchema = z.object({
	issues: z.array(searchIssueHitSchema),
	comments: z.array(searchCommentHitSchema),
	projects: z.array(searchProjectHitSchema),
	members: z.array(searchMemberHitSchema),
});

export const pageMetaSchema = {
	total: z.number().int(),
	page: z.number().int(),
	pageSize: z.number().int(),
};

export const issuesOutputSchema = z.object({
	items: z.array(issueSummarySchema),
	...pageMetaSchema,
});

export const commentsOutputSchema = z.object({
	comments: z.array(commentSummarySchema),
	...pageMetaSchema,
});

export type OrgSummary = z.infer<typeof orgSummarySchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
type ProjectSummary = z.infer<typeof projectSummarySchema>;
type CycleSummary = z.infer<typeof cycleSummarySchema>;
type ProjectUpdateSummary = z.infer<typeof projectUpdateSummarySchema>;
type IssueSummary = z.infer<typeof issueSummarySchema>;
type CommentSummary = z.infer<typeof commentSummarySchema>;
type LabelSummary = z.infer<typeof labelSummarySchema>;
type StatusSummary = z.infer<typeof statusSummarySchema>;
type ActivitySummary = z.infer<typeof activitySummarySchema>;
type ViewSummary = z.infer<typeof viewSummarySchema>;

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
				health: string | null;
				targetDate: string | null;
				leadId: string | null;
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
	health: project.health,
	targetDate: project.targetDate,
	leadId: project.leadId,
	createdAt: project.createdAt,
	updatedAt: project.updatedAt,
});

export const toCycleSummary = (cycle: {
	id: string;
	projectId: string;
	name: string;
	number: number;
	startsAt: string;
	endsAt: string;
	status: "upcoming" | "current" | "past";
	progress: { total: number; terminal: number; percent: number };
	createdAt: string;
	updatedAt: string;
}): CycleSummary => ({
	id: cycle.id,
	projectId: cycle.projectId,
	name: cycle.name,
	number: cycle.number,
	startsAt: cycle.startsAt,
	endsAt: cycle.endsAt,
	status: cycle.status,
	progress: cycle.progress,
	createdAt: cycle.createdAt,
	updatedAt: cycle.updatedAt,
});

export const toProjectUpdateSummary = (
	update: ProjectUpdateDto,
): ProjectUpdateSummary => ({
	id: update.id,
	projectId: update.projectId,
	body: update.body,
	health: update.health,
	author: update.author,
	createdAt: update.createdAt,
	updatedAt: update.updatedAt,
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
	cycleId: issue.cycleId,
	// Present (null when active) so models can tell an archived issue apart.
	archivedAt: issue.archivedAt ?? null,
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
	parentId: comment.parentId,
	resolvedAt: comment.resolvedAt,
	mentions: comment.mentions.map((mention) => ({
		id: mention.id,
		name: mention.name,
	})),
	reactions: comment.reactions.map((reaction) => ({
		emoji: reaction.emoji,
		count: reaction.count,
	})),
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

export const toViewSummary = (view: ViewDto): ViewSummary => ({
	id: view.id,
	orgId: view.orgId,
	projectId: view.projectId,
	name: view.name,
	description: view.description,
	ownerId: view.ownerId,
	shared: view.shared,
	isDefault: view.isDefault,
	layout: view.layout,
	query: view.query,
	createdAt: view.createdAt,
	updatedAt: view.updatedAt,
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

export const uniqueLinks = (links: CapabilityLink[]): CapabilityLink[] => [
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

export const issueRefWithPaginationSchema = z
	.object({ ...issueRefShape, ...paginationInputShape })
	.refine(resolveRef, {
		message: "Provide issueId, or projectKey together with number.",
	});

export const listIssuesInputSchema = z.object({
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
	/** Planning cycle id (assign issues of one cycle to the list). */
	cycleId: z.string().min(1).optional(),
	/** Structured filter tree; AND-combined with the flat filters above. */
	filter: issueFilterNodeSchema.optional(),
	...paginationInputShape,
	/** Legacy scalar sort or a prioritized list of sort keys. */
	sort: z
		.union([
			z.enum(["updated", "created", "priority"]),
			z.array(issueQuerySortSchema).max(ISSUE_QUERY_MAX_SORTS),
		])
		.default("updated"),
	/**
	 * Presentation-only grouping hint: it is forwarded to the service and kept
	 * for view parity, but rows are returned flat (the web client derives
	 * groups). It is not reflected in the response.
	 */
	groupBy: z.enum(ISSUE_QUERY_GROUP_BY).optional(),
	/** Include archived issues (hidden from lists by default). */
	includeArchived: z.boolean().default(false),
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
			ApiErrorCode.VALIDATION,
			"Provide issueId, or projectKey together with number.",
		);
	}
	const project = await deps.daos.projectDao.findByKey(orgId, ref.projectKey);
	if (!project) {
		throw new ApiError(
			ApiErrorCode.PROJECT_NOT_FOUND,
			`Project ${ref.projectKey} not found`,
		);
	}
	return deps.services.issueService.getIssue(orgId, project.id, ref.number);
};
