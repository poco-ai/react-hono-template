import { and, desc, eq, type SQL } from "drizzle-orm";
import { user } from "../db/auth-schema";
import { activities, issues, projects } from "../db/schema";
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
};

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
	actor: {
		id: user.id,
		name: user.name,
		email: user.email,
		image: user.image,
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
	insert: async (rows: ActivityInsert[]): Promise<void> => {
		if (rows.length === 0) {
			return;
		}
		await db.insert(activities).values(rows);
	},

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
		query: { projectId?: string; limit?: number },
	): Promise<OrgActivityDto[]> => {
		const conditions: SQL[] = [eq(activities.orgId, orgId)];
		if (query.projectId) {
			conditions.push(eq(activities.projectId, query.projectId));
		}
		const rows = await db
			.select({
				...ACTIVITY_SELECT,
				issue: {
					id: issues.id,
					number: issues.number,
					title: issues.title,
				},
				project: {
					id: projects.id,
					key: projects.key,
					name: projects.name,
				},
			})
			.from(activities)
			.innerJoin(user, eq(user.id, activities.actorId))
			.innerJoin(issues, eq(issues.id, activities.issueId))
			.innerJoin(projects, eq(projects.id, activities.projectId))
			.where(and(...conditions))
			.orderBy(desc(activities.createdAt), desc(activities.id))
			.limit(query.limit ?? 50);
		return rows.map((row) => ({
			...toActivityDto(row),
			issue: row.issue,
			project: row.project,
		}));
	},
});

export type ActivityDao = ReturnType<typeof createActivityDao>;
