import {
	ApiError,
	ApiErrorCode,
	cycleListQuerySchema,
	projectUpdateListQuerySchema,
	SEARCH_DEFAULT_LIMIT,
	SEARCH_MAX_LIMIT,
	SEARCH_MAX_QUERY_LENGTH,
} from "@workspace/shared";
import { z } from "zod";
import {
	activitySummarySchema,
	commentsOutputSchema,
	cycleSummarySchema,
	issueLink,
	issueRefSchema,
	issueRefWithPaginationSchema,
	issueRelationSummarySchema,
	issueSummarySchema,
	issuesOutputSchema,
	labelSummarySchema,
	labelsLink,
	listIssuesInputSchema,
	type MemberSummary,
	memberSummarySchema,
	type OrgSummary,
	orgLink,
	orgSummarySchema,
	pageMetaSchema,
	projectLink,
	projectSummarySchema,
	projectUpdateSummarySchema,
	resolveIssueRef,
	searchResultsSchema,
	statusesLink,
	statusSummarySchema,
	toCommentSummary,
	toCycleSummary,
	toIssueActivitySummary,
	toIssueSummary,
	toLabelSummary,
	toOrgSummary,
	toProjectSummary,
	toProjectUpdateSummary,
	toStatusSummary,
	toViewSummary,
	uniqueLinks,
	viewSummarySchema,
} from "./projections";
import { type CapabilityDeps, defineCapability } from "./types";

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
			'List issues in the organization or one project, paginated and newest first. Filters: projectId, statusId (workflow status; the legacy status name is also accepted), priority, assigneeId (or "none" for unassigned), labelId, cycleId, free-text search, and a structured filter tree (AND-combined with the flat filters; same fields as views). sort accepts updated/created/priority or up to three {field, direction} keys; groupBy (status/assignee/priority/label) is a client presentation hint and rows stay flat. Archived issues are hidden unless includeArchived is true, and organization-wide lists hide issues of archived projects.',
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
							ApiErrorCode.MCP_ORG_REQUIRED,
							"An organization is required for API key access.",
						);
					}
					const org = await deps.daos.organizationDao.findById(ctx.orgId);
					if (!org) {
						throw new ApiError(
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
							ApiErrorCode.NOT_FOUND,
							"Organization not found",
						);
					}
					orgs = [toOrgSummary(org)];
				} else {
					throw new ApiError(
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
					throw new ApiError(ApiErrorCode.NOT_FOUND, "Organization not found");
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
			name: "search_all",
			titleKey: "ai.capabilities.search_all.title",
			description:
				"Search the whole organization in one call: issues and comments by full text, projects by name/description and members by name or email. Every section is capped by limit (default 8, max 20). Archived projects are excluded, together with their issues and comments. Use it for quick lookups such as a keyword, a project name or a teammate's name.",
			input: z.object({
				q: z.string().trim().min(1).max(SEARCH_MAX_QUERY_LENGTH),
				limit: z
					.number()
					.int()
					.min(1)
					.max(SEARCH_MAX_LIMIT)
					.default(SEARCH_DEFAULT_LIMIT),
			}),
			output: searchResultsSchema,
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const results = await deps.services.searchService.searchAll(orgId, {
					q: input.q,
					limit: input.limit,
				});
				return {
					data: results,
					summary: `Found ${results.issues.length} issue(s), ${results.comments.length} comment(s), ${results.projects.length} project(s) and ${results.members.length} member(s) matching "${input.q}".`,
					links: uniqueLinks([
						orgLink(ctx, orgId),
						...results.issues.map((issue) =>
							issueLink(ctx, orgId, issue.projectId, issue.number),
						),
						...results.comments.map((comment) =>
							issueLink(
								ctx,
								orgId,
								comment.issue.projectId,
								comment.issue.number,
							),
						),
						...results.projects.map((project) =>
							projectLink(ctx, orgId, project.id),
						),
					]),
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
			name: "list_views",
			titleKey: "ai.capabilities.list_views.title",
			description:
				"List saved issue views visible to the caller: their own views plus every view shared in the organization. Each view includes its structured query (filter tree, sorts, grouping) and layout. To run a view, pass its query.filter and query.sort to list_issues; grouping and layout are presentation hints the web client applies.",
			input: z.object({ projectId: z.string().min(1).optional() }),
			output: z.object({ views: z.array(viewSummarySchema) }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const views = await deps.services.viewService.listViews(
					orgId,
					ctx.actor.userId ?? "",
					{ projectId: input.projectId },
				);
				return {
					data: { views: views.map(toViewSummary) },
					summary: `Found ${views.length} saved view(s).`,
					links: uniqueLinks(
						views.map((view) =>
							view.projectId
								? projectLink(ctx, orgId, view.projectId)
								: orgLink(ctx, orgId),
						),
					),
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
				offset: z.number().int().min(0).max(10000).default(0),
			}),
			output: z.object({ activities: z.array(activitySummarySchema) }),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const activities = await deps.services.activityService.listByOrg(
					orgId,
					{
						projectId: input.projectId,
						limit: input.limit,
						offset: input.offset,
					},
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
		defineCapability({
			name: "list_cycles",
			titleKey: "ai.capabilities.list_cycles.title",
			description:
				"List a project's planning cycles (time-boxed iterations) with their derived status (upcoming/current/past), dates and issue progress (total, terminal, percent). Filter by status (current/upcoming/past/all) and paginate. Cycles never overlap in time.",
			input: cycleListQuerySchema.extend({
				projectId: z.string().min(1),
			}),
			output: z.object({
				cycles: z.array(cycleSummarySchema),
				...pageMetaSchema,
			}),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const { projectId, ...query } = input;
				const page = await deps.services.cycleService.listCycles(
					orgId,
					projectId,
					query,
				);
				return {
					data: {
						cycles: page.items.map(toCycleSummary),
						total: page.total,
						page: page.page,
						pageSize: page.pageSize,
					},
					summary: `Found ${page.total} cycle(s); showing page ${page.page}.`,
					links: [projectLink(ctx, orgId, projectId)],
				};
			},
		}),

		defineCapability({
			name: "list_project_updates",
			titleKey: "ai.capabilities.list_project_updates.title",
			description:
				"List a project's status updates (newest first), each with its body, reported health (on_track/at_risk/off_track or null) and author.",
			input: projectUpdateListQuerySchema.extend({
				projectId: z.string().min(1),
			}),
			output: z.object({
				updates: z.array(projectUpdateSummarySchema),
				...pageMetaSchema,
			}),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const { projectId, ...query } = input;
				const page = await deps.services.projectUpdateService.listUpdates(
					orgId,
					projectId,
					query,
				);
				return {
					data: {
						updates: page.items.map(toProjectUpdateSummary),
						total: page.total,
						page: page.page,
						pageSize: page.pageSize,
					},
					summary: `Project has ${page.total} update(s); showing page ${page.page}.`,
					links: [projectLink(ctx, orgId, projectId)],
				};
			},
		}),

		defineCapability({
			name: "list_favorites",
			titleKey: "ai.capabilities.list_favorites.title",
			description:
				"List the caller's favorited issues and projects in the current organization. Issue entries include their project key, number and status; project entries include name and health.",
			input: z.object({}),
			output: z.object({
				favorites: z.array(
					z.object({
						id: z.string(),
						entityType: z.enum(["issue", "project"]),
						entityId: z.string(),
						createdAt: z.string(),
						issue: z
							.object({
								id: z.string(),
								projectId: z.string(),
								projectKey: z.string(),
								number: z.number().int(),
								identifier: z.string(),
								title: z.string(),
								statusId: z.string(),
								statusName: z.string(),
								statusCategory: z.string(),
								statusColor: z.string(),
							})
							.nullable(),
						project: z
							.object({
								id: z.string(),
								name: z.string(),
								key: z.string(),
								health: z.string().nullable(),
								archived: z.boolean(),
							})
							.nullable(),
					}),
				),
			}),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx) => {
				const orgId = ctx.orgId as string;
				const favorites = await deps.services.favoriteService.listFavorites(
					orgId,
					ctx.actor.userId ?? "",
				);
				return {
					data: {
						favorites: favorites.map((favorite) => ({
							id: favorite.id,
							entityType: favorite.entityType,
							entityId: favorite.entityId,
							createdAt: favorite.createdAt,
							issue: favorite.issue,
							project: favorite.project,
						})),
					},
					summary: `Found ${favorites.length} favorite(s).`,
					links: uniqueLinks(
						favorites.flatMap((favorite) =>
							favorite.issue
								? [
										issueLink(
											ctx,
											orgId,
											favorite.issue.projectId,
											favorite.issue.number,
										),
									]
								: favorite.project
									? [projectLink(ctx, orgId, favorite.project.id)]
									: [],
						),
					),
				};
			},
		}),

		defineCapability({
			name: "list_issue_templates",
			titleKey: "ai.capabilities.list_issue_templates.title",
			description:
				"List the organization's issue templates (prefills for new issues), optionally limited to one project. Templates hold a title, description, statusId, priority, labels and estimate.",
			input: z.object({ projectId: z.string().min(1).optional() }),
			output: z.object({
				templates: z.array(
					z.object({
						id: z.string(),
						projectId: z.string().nullable(),
						name: z.string(),
						title: z.string(),
						description: z.string().nullable(),
						statusId: z.string().nullable(),
						priority: z.number().int().nullable(),
						labelIds: z.array(z.string()),
						estimate: z.number().int().nullable(),
						createdAt: z.string(),
						updatedAt: z.string(),
					}),
				),
			}),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const templates =
					await deps.services.issueTemplateService.listTemplates(orgId, {
						projectId: input.projectId,
					});
				return {
					data: {
						templates: templates.map((template) => ({
							id: template.id,
							projectId: template.projectId,
							name: template.name,
							title: template.title,
							description: template.description,
							statusId: template.statusId,
							priority: template.priority,
							labelIds: template.labelIds,
							estimate: template.estimate,
							createdAt: template.createdAt,
							updatedAt: template.updatedAt,
						})),
					},
					summary: `Found ${templates.length} issue template(s).`,
					links: [orgLink(ctx, orgId)],
				};
			},
		}),

		defineCapability({
			name: "list_recurrences",
			titleKey: "ai.capabilities.list_recurrences.title",
			description:
				"List a project's recurring issue templates with their cadence (daily/weekly/monthly), next run time, last run time and active state. Recurring templates create a new issue on each due run.",
			input: z.object({ projectId: z.string().min(1) }),
			output: z.object({
				recurrences: z.array(
					z.object({
						id: z.string(),
						projectId: z.string(),
						title: z.string(),
						description: z.string().nullable(),
						statusId: z.string().nullable(),
						priority: z.number().int(),
						assigneeId: z.string().nullable(),
						labelIds: z.array(z.string()),
						estimate: z.number().int().nullable(),
						cadence: z.enum(["daily", "weekly", "monthly"]),
						nextRunAt: z.string(),
						/** UTC day-of-month monthly runs anchor to (1-31). */
						anchorDay: z.number().int().optional(),
						lastRunAt: z.string().nullable(),
						active: z.boolean(),
						createdAt: z.string(),
						updatedAt: z.string(),
					}),
				),
			}),
			effect: "read",
			scopes: ["read"],
			execute: async (ctx, input) => {
				const orgId = ctx.orgId as string;
				const recurrences =
					await deps.services.recurrenceService.listRecurrences(
						orgId,
						input.projectId,
					);
				return {
					data: {
						recurrences: recurrences.map((recurrence) => ({
							id: recurrence.id,
							projectId: recurrence.projectId,
							title: recurrence.title,
							description: recurrence.description,
							statusId: recurrence.statusId,
							priority: recurrence.priority,
							assigneeId: recurrence.assigneeId,
							labelIds: recurrence.labelIds,
							estimate: recurrence.estimate,
							cadence: recurrence.cadence,
							nextRunAt: recurrence.nextRunAt,
							anchorDay: recurrence.anchorDay,
							lastRunAt: recurrence.lastRunAt,
							active: recurrence.active,
							createdAt: recurrence.createdAt,
							updatedAt: recurrence.updatedAt,
						})),
					},
					summary: `Found ${recurrences.length} recurring issue(s).`,
					links: [projectLink(ctx, orgId, input.projectId)],
				};
			},
		}),
	] as const;

export type ReadCapability = ReturnType<typeof createReadCapabilities>[number];
