import { TERMINAL_ISSUE_STATUSES } from "@workspace/shared";
import { and, count, desc, eq, isNull, notInArray } from "drizzle-orm";
import { issues, projects } from "../db/schema";
import type { Database } from "../db/types";
import type { ProjectDto, ProjectIssueStats } from "../dto/project.dto";

type ProjectRow = typeof projects.$inferSelect;

export const toProjectDto = (row: ProjectRow): ProjectDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const createProjectDao = (db: Database) => ({
	listByOrg: async (
		orgId: string,
		options?: { includeArchived?: boolean },
	): Promise<ProjectDto[]> => {
		const includeArchived = options?.includeArchived ?? true;
		const rows = await db
			.select()
			.from(projects)
			.where(
				includeArchived
					? eq(projects.orgId, orgId)
					: and(eq(projects.orgId, orgId), eq(projects.archived, false)),
			)
			.orderBy(desc(projects.createdAt), desc(projects.id))
			.all();
		return rows.map(toProjectDto);
	},

	findById: async (orgId: string, id: string): Promise<ProjectDto | null> => {
		const row = await db
			.select()
			.from(projects)
			.where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
			.get();
		return row ? toProjectDto(row) : null;
	},

	findByKey: async (orgId: string, key: string): Promise<ProjectDto | null> => {
		const row = await db
			.select()
			.from(projects)
			.where(and(eq(projects.orgId, orgId), eq(projects.key, key)))
			.get();
		return row ? toProjectDto(row) : null;
	},

	countByOrg: async (orgId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(projects)
			.where(eq(projects.orgId, orgId));
		return row?.value ?? 0;
	},

	listIssueCountsByOrg: async (
		orgId: string,
	): Promise<Map<string, ProjectIssueStats>> => {
		const notDeleted = and(eq(issues.orgId, orgId), isNull(issues.deletedAt));
		const totals = await db
			.select({ projectId: issues.projectId, value: count() })
			.from(issues)
			.where(notDeleted)
			.groupBy(issues.projectId)
			.all();
		const open = await db
			.select({ projectId: issues.projectId, value: count() })
			.from(issues)
			.where(
				and(
					notDeleted,
					notInArray(issues.status, [...TERMINAL_ISSUE_STATUSES]),
				),
			)
			.groupBy(issues.projectId)
			.all();
		const counts = new Map<string, ProjectIssueStats>();
		for (const row of totals) {
			counts.set(row.projectId, {
				openIssueCount: 0,
				totalIssueCount: row.value,
			});
		}
		for (const row of open) {
			const entry = counts.get(row.projectId);
			if (entry) {
				entry.openIssueCount = row.value;
			}
		}
		return counts;
	},

	create: async (data: {
		id: string;
		orgId: string;
		name: string;
		key: string;
		description: string | null;
		color: string | null;
	}): Promise<ProjectDto> => {
		const row = await db.insert(projects).values(data).returning().get();
		return toProjectDto(row);
	},

	update: async (
		orgId: string,
		id: string,
		patch: Partial<{
			name: string;
			key: string;
			description: string | null;
			color: string | null;
			archived: boolean;
		}>,
	): Promise<ProjectDto | null> => {
		const patchEntries = Object.fromEntries(
			Object.entries(patch).filter(([, value]) => value !== undefined),
		);
		if (Object.keys(patchEntries).length === 0) {
			const current = await db
				.select()
				.from(projects)
				.where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
				.get();
			return current ? toProjectDto(current) : null;
		}
		const row = await db
			.update(projects)
			.set(patchEntries)
			.where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
			.returning()
			.get();
		return row ? toProjectDto(row) : null;
	},
});

export type ProjectDao = ReturnType<typeof createProjectDao>;
