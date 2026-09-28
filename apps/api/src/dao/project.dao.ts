import { and, count, eq } from "drizzle-orm";
import { projects } from "../db/schema";
import type { Database } from "../db/types";
import type { ProjectDto } from "../dto/project.dto";

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
