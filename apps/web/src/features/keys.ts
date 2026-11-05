/**
 * Canonical TanStack Query key factories shared across feature data modules.
 *
 * This module must stay dependency-free (no imports) so every `features/<x>/data.ts`
 * can depend on it without creating import cycles. Keys that need domain types
 * (`IssueFilters`, `CycleStatusFilter`, `NotificationFilter`, `SearchRequest`)
 * stay in their owning data module.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const sessionKey = () => ["session"] as const;
export const oauthProvidersKey = () => ["oauth", "providers"] as const;
export const bootstrapKey = () => ["bootstrap"] as const;

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const organizationsKey = () => ["orgs"] as const;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const membersKey = (orgId: string) =>
	["orgs", orgId, "members"] as const;
export const invitationsKey = (orgId: string) =>
	["orgs", orgId, "invitations"] as const;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectsRootKey = (orgId: string) =>
	["orgs", orgId, "projects"] as const;
export const projectKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId] as const;

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export const orgIssuesRootKey = (orgId: string) =>
	["orgs", orgId, "issues"] as const;
export const issueKey = (orgId: string, projectId: string, number: number) =>
	["orgs", orgId, "projects", projectId, "issues", "detail", number] as const;
export const issueDetailRootKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "issues", "detail"] as const;
export const issueRelationsKey = (
	orgId: string,
	projectId: string,
	number: number,
) => [...issueKey(orgId, projectId, number), "relations"] as const;

/** Prefix covering every filtered/paginated issue list of one project. */
export const projectIssuesRootKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "issues"] as const;

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

/** Triage queue root; owned here so issue writes can invalidate it without an import cycle. */
export const triageRootKey = (orgId: string) =>
	["orgs", orgId, "triage"] as const;
export const triageKey = (orgId: string, projectId?: string) =>
	[...triageRootKey(orgId), projectId ?? "all"] as const;

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

export const cyclesRootKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "cycles"] as const;
export const cycleKey = (orgId: string, projectId: string, cycleId: string) =>
	[...cyclesRootKey(orgId, projectId), "detail", cycleId] as const;

// ---------------------------------------------------------------------------
// Recurrences
// ---------------------------------------------------------------------------

export const recurrencesKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "recurrences"] as const;

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

export const roadmapRootKey = (orgId: string) =>
	["orgs", orgId, "roadmap"] as const;
export const roadmapKey = (orgId: string, from?: string, to?: string) =>
	[...roadmapRootKey(orgId), from ?? "default", to ?? "default"] as const;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const viewsRootKey = (orgId: string) =>
	["orgs", orgId, "views"] as const;
export const viewsKey = (orgId: string, projectId?: string) =>
	projectId
		? ([...viewsRootKey(orgId), projectId] as const)
		: viewsRootKey(orgId);

// ---------------------------------------------------------------------------
// Statuses & labels
// ---------------------------------------------------------------------------

export const statusesKey = (orgId: string) =>
	["orgs", orgId, "statuses"] as const;
export const labelsKey = (orgId: string) => ["orgs", orgId, "labels"] as const;

// ---------------------------------------------------------------------------
// Comments & attachments
// ---------------------------------------------------------------------------

export function commentsQueryKey(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return [
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"comments",
	] as const;
}

export function attachmentsQueryKey(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return [
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"attachments",
	] as const;
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const orgActivitiesRootKey = (orgId: string) =>
	["orgs", orgId, "activities"] as const;

export const issueActivitiesKey = (
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	[
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"activities",
	] as const;

/** Infinite-list key; the resource root stays a prefix for invalidation. */
export const orgActivitiesKey = (
	orgId: string,
	{ projectId }: { projectId?: string } = {},
) =>
	[
		"orgs",
		orgId,
		"activities",
		"list",
		{ projectId: projectId ?? null },
	] as const;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationsRootKey = (orgId: string) =>
	["orgs", orgId, "notifications"] as const;
export const notificationsUnreadCountKey = (orgId: string) =>
	[...notificationsRootKey(orgId), "unread-count"] as const;

export const issueSubscriptionKey = (
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	[
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"subscription",
	] as const;

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

/**
 * Personal favorites (pinned issues and projects) of the signed-in member.
 *
 * The backend hydrates every row with its issue/project summary and drops
 * favorites whose entity was deleted or archived, so the list is the single
 * source of truth for star state across the app.
 */
export const favoritesRootKey = (orgId: string) =>
	["orgs", orgId, "favorites"] as const;

// ---------------------------------------------------------------------------
// Project updates
// ---------------------------------------------------------------------------

/** Newest-first project update timeline for one project. */
export const projectUpdatesKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "updates"] as const;

// ---------------------------------------------------------------------------
// Issue templates
// ---------------------------------------------------------------------------

/**
 * Reusable issue prefills. Templates are read by the create-issue dialog and
 * managed in organization settings; applying one is a client-side action, so
 * template writes only refresh the template list (never issue caches).
 */
export const issueTemplatesRootKey = (orgId: string) =>
	["orgs", orgId, "issueTemplates"] as const;

export const issueTemplatesKey = (
	orgId: string,
	{ projectId }: { projectId?: string } = {},
) =>
	[...issueTemplatesRootKey(orgId), { projectId: projectId ?? null }] as const;

// ---------------------------------------------------------------------------
// AI — always under ["orgs", orgId, "ai", ...].
// ---------------------------------------------------------------------------

export const aiRootKey = (orgId: string) => ["orgs", orgId, "ai"] as const;

export const aiConversationsRootKey = (orgId: string) =>
	[...aiRootKey(orgId), "conversations"] as const;

export const aiConversationListKey = (orgId: string) =>
	[...aiConversationsRootKey(orgId), "list"] as const;

export const aiConversationDetailKey = (orgId: string, id: string) =>
	[...aiConversationsRootKey(orgId), "detail", id] as const;

export const aiUsageKey = (orgId: string) =>
	[...aiRootKey(orgId), "usage"] as const;

export const aiSettingsKey = (orgId: string) =>
	[...aiRootKey(orgId), "settings"] as const;

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

export const mcpInfoKey = (orgId: string) =>
	["orgs", orgId, "mcp", "info"] as const;

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export function webhooksKey(orgId: string) {
	return ["orgs", orgId, "webhooks"] as const;
}

export function webhookDeliveriesRootKey(orgId: string, webhookId: string) {
	return ["orgs", orgId, "webhooks", webhookId, "deliveries"] as const;
}

export const webhookDeliveriesKey = (
	orgId: string,
	webhookId: string,
	page: number,
) => [...webhookDeliveriesRootKey(orgId, webhookId), page] as const;

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export function apiKeysRootKey(orgId: string) {
	return ["orgs", orgId, "api-keys"] as const;
}

export const apiKeysKey = (orgId: string, page: number) =>
	[...apiKeysRootKey(orgId), page] as const;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminOrgsRootKey = () => ["admin-orgs"] as const;
export const adminStatsKey = () => ["admin-stats"] as const;
export const adminOrgsKey = (page: number, search: string) =>
	[...adminOrgsRootKey(), page, search] as const;

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export function billingRootKey(orgId: string) {
	return ["orgs", orgId, "billing"] as const;
}
