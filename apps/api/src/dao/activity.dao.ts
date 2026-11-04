import { TERMINAL_STATUS_CATEGORIES } from "@workspace/shared";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { user } from "../db/auth-schema";
import { activities, issueStatuses, issues, projects } from "../db/schema";
import type { Database } from "../db/types";
import type { ActivityDto, OrgActivityDto } from "../dto/activity.dto";

export type ActivityInsert = {
	id: string;
	orgId: string;
	projectId: string;
	issueId: string;
	actorId: string;
	action: string;
	field: string | null;
	oldValue: string | null;
	newValue: string | null;
	/** Origin of the write, e.g. "ai" or "mcp"; null for the web app. */
	source?: string | null;
	/** Originating tool-call id when the write came from AI/MCP. */
	sourceId?: string | null;
};

/**
 * Composable insert statement for callers that must keep the activity rows in
 * the same `db.batch` as their primary write (D1 batches are transactions).
 * This module stays the only place that touches the activities table.
 */
export const activityInsertStatement = (
	db: Database,
	rows: ActivityInsert[],
): BatchItem<"sqlite"> => db.insert(activities).values(rows);

/**
 * Conditional single-row activity insert: the row is written only when
 * `condition` holds at statement time. Callers pair it with a primary write
 * (e.g. a DELETE that may remove nothing) in the same `db.batch` — the
 * condition runs before the primary statement, so the activity appears iff
 * the primary write actually happened.
 */
export const activityInsertWhenStatement = (
	db: Database,
	row: ActivityInsert,
	condition: SQL,
): BatchItem<"sqlite"> =>
	db.insert(activities).select(sql`
		SELECT ${row.id}, ${row.orgId}, ${row.projectId}, ${row.issueId},
			${row.actorId}, ${row.action}, ${row.field}, ${row.oldValue},
			${row.newValue}, ${row.source ?? null}, ${row.sourceId ?? null},
			cast(unixepoch('subsecond') * 1000 as integer)
		WHERE ${condition}
	`);

/**
 * Set-based status-migration activity: one INSERT ... SELECT writes a
 * `field = "status"` row for every issue still pointing at the deleted status.
 * It stays a single statement so deleting a status with many issues does not
 * fan out into hundreds of inserts (and webhook dispatches).
 */
export const statusMigrationActivityStatement = (
	db: Database,
	params: {
		orgId: string;
		statusId: string;
		actorId: string;
		oldStatusName: string;
		newStatusName: string;
	},
): BatchItem<"sqlite"> =>
	db.insert(activities).select(sql`
		SELECT
			lower(hex(randomblob(16))),
			${issues.orgId},
			${issues.projectId},
			${issues.id},
			${params.actorId},
			'issue.updated',
			'status',
			${params.oldStatusName},
			${params.newStatusName},
			NULL,
			NULL,
			cast(unixepoch('subsecond') * 1000 as integer)
		FROM ${issues}
		WHERE ${issues.orgId} = ${params.orgId}
			AND ${issues.statusId} = ${params.statusId}
	`);

/**
 * Shared terminal-category filter for set-based activity statements so the
 * INSERT ... SELECT and the following UPDATE can never drift apart.
 */
const terminalCategoryList = sql.join(
	TERMINAL_STATUS_CATEGORIES.map((category) => sql`${category}`),
	sql`, `,
);

/**
 * Set-based cycle rollover activity: one INSERT ... SELECT writes a
 * `field = "cycle"` row for every non-terminal issue still assigned to the
 * source cycle. It must run before the rollover UPDATE in the same batch.
 */
export const cycleRolloverActivityStatement = (
	db: Database,
	params: {
		orgId: string;
		projectId: string;
		sourceCycleId: string;
		actorId: string;
		sourceName: string;
		targetName: string;
	},
): BatchItem<"sqlite"> =>
	db.insert(activities).select(sql`
		SELECT
			lower(hex(randomblob(16))),
			${issues.orgId},
			${issues.projectId},
			${issues.id},
			${params.actorId},
			'issue.updated',
			'cycle',
			${params.sourceName},
			${params.targetName},
			NULL,
			NULL,
			cast(unixepoch('subsecond') * 1000 as integer)
		FROM ${issues}
		INNER JOIN ${issueStatuses}
			ON ${issueStatuses.id} = ${issues.statusId}
		WHERE ${issues.orgId} = ${params.orgId}
			AND ${issues.projectId} = ${params.projectId}
			AND ${issues.cycleId} = ${params.sourceCycleId}
			AND ${issues.deletedAt} IS NULL
			AND ${issues.archivedAt} IS NULL
			AND ${issueStatuses.category} NOT IN (${terminalCategoryList})
	`);

/**
 * Set-based cycle deletion activity: one `field = "cycle"` row per issue still
 * attached to the deleted cycle, with a null new value. Runs before the detach
 * UPDATE in the same batch, so it still sees the old assignment.
 */
export const cycleDetachActivityStatement = (
	db: Database,
	params: {
		orgId: string;
		sourceCycleId: string;
		actorId: string;
		sourceName: string;
	},
): BatchItem<"sqlite"> =>
	db.insert(activities).select(sql`
		SELECT
			lower(hex(randomblob(16))),
			${issues.orgId},
			${issues.projectId},
			${issues.id},
			${params.actorId},
			'issue.updated',
			'cycle',
			${params.sourceName},
			NULL,
			NULL,
			NULL,
			cast(unixepoch('subsecond') * 1000 as integer)
		FROM ${issues}
		WHERE ${issues.orgId} = ${params.orgId}
			AND ${issues.cycleId} = ${params.sourceCycleId}
			AND ${issues.deletedAt} IS NULL
	`);

const ACTIVITY_SELECT = {
	id: activities.id,
	orgId: activities.orgId,
	projectId: activities.projectId,
	issueId: activities.issueId,
	action: activities.action,
	field: activities.field,
	oldValue: activities.oldValue,
	newValue: activities.newValue,
	createdAt: activities.createdAt,
	// Joined columns need unique SQL names — see drizzle-orm#6038.
	actor: {
		id: user.id.as("actor_user_id"),
		name: user.name.as("actor_user_name"),
		email: user.email.as("actor_user_email"),
		image: user.image.as("actor_user_image"),
	},
};

const toActivityDto = (row: {
	id: string;
	orgId: string;
	projectId: string;
	issueId: string;
	action: string;
	field: string | null;
	oldValue: string | null;
	newValue: string | null;
	createdAt: Date;
	actor: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
}): ActivityDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
});

export const createActivityDao = (db: Database) => ({
	listByIssue: async (
		orgId: string,
		issueId: string,
	): Promise<ActivityDto[]> => {
		const rows = await db
			.select(ACTIVITY_SELECT)
			.from(activities)
			.innerJoin(user, eq(user.id, activities.actorId))
			.where(and(eq(activities.orgId, orgId), eq(activities.issueId, issueId)))
			.orderBy(desc(activities.createdAt), desc(activities.id))
			.limit(100);
		return rows.map(toActivityDto).reverse();
	},

	listByOrg: async (
		orgId: string,
		query: { projectId?: string; limit?: number; offset?: number },
	): Promise<OrgActivityDto[]> => {
		const conditions: SQL[] = [eq(activities.orgId, orgId)];
		if (query.projectId) {
			conditions.push(eq(activities.projectId, query.projectId));
		}
		const rows = await db
			.select({
				...ACTIVITY_SELECT,
				// Joined columns need unique SQL names — see drizzle-orm#6038.
				issue: {
					id: issues.id.as("activity_issue_id"),
					number: issues.number.as("activity_issue_number"),
					title: issues.title.as("activity_issue_title"),
				},
				project: {
					id: projects.id.as("activity_project_id"),
					key: projects.key.as("activity_project_key"),
					name: projects.name.as("activity_project_name"),
				},
			})
			.from(activities)
			.innerJoin(user, eq(user.id, activities.actorId))
			.innerJoin(issues, eq(issues.id, activities.issueId))
			.innerJoin(projects, eq(projects.id, activities.projectId))
			.where(and(...conditions))
			.orderBy(desc(activities.createdAt), desc(activities.id))
			.limit(query.limit ?? 50)
			.offset(query.offset ?? 0);
		return rows.map((row) => ({
			...toActivityDto(row),
			issue: row.issue,
			project: row.project,
		}));
	},
});

export type ActivityDao = ReturnType<typeof createActivityDao>;
