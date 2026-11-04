import { and, count, desc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { user } from "../db/auth-schema";
import { projects, projectUpdates } from "../db/schema";
import type { Database } from "../db/types";
import type {
	ListProjectUpdatesDto,
	ProjectUpdateDto,
} from "../dto/project-update.dto";

type ProjectUpdateRow = typeof projectUpdates.$inferSelect;

const toProjectUpdateDto = (row: {
	update: ProjectUpdateRow;
	author: {
		id: string | null;
		name: string | null;
		email: string | null;
		image: string | null;
	} | null;
}): ProjectUpdateDto => ({
	...row.update,
	createdAt: row.update.createdAt.toISOString(),
	updatedAt: row.update.updatedAt.toISOString(),
	author:
		row.author?.id && row.author.name !== null && row.author.email !== null
			? {
					id: row.author.id,
					name: row.author.name,
					email: row.author.email,
					image: row.author.image,
				}
			: null,
});

const UPDATE_SELECT = {
	update: projectUpdates,
	// Joined columns need unique SQL names — see drizzle-orm#6038.
	author: {
		id: user.id.as("author_user_id"),
		name: user.name.as("author_user_name"),
		email: user.email.as("author_user_email"),
		image: user.image.as("author_user_image"),
	},
};

export const createProjectUpdateDao = (db: Database) => {
	const projectScope = (orgId: string, projectId: string) =>
		and(
			eq(projectUpdates.orgId, orgId),
			eq(projectUpdates.projectId, projectId),
		);

	/**
	 * Rollup write kept in the same batch as the update row: the report being
	 * written is the newest health signal, so it wins on projects.health.
	 */
	const syncProjectHealthStatement = (
		orgId: string,
		projectId: string,
		health: string,
	): BatchItem<"sqlite"> =>
		db
			.update(projects)
			.set({ health })
			.where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)));

	return {
		listByProject: async (
			orgId: string,
			projectId: string,
			options: { page: number; pageSize: number },
		): Promise<ListProjectUpdatesDto> => {
			const where = projectScope(orgId, projectId);
			const [rows, totals] = await db.batch([
				db
					.select(UPDATE_SELECT)
					.from(projectUpdates)
					.leftJoin(user, eq(user.id, projectUpdates.authorId))
					.where(where)
					.orderBy(desc(projectUpdates.createdAt), desc(projectUpdates.id))
					.limit(options.pageSize)
					.offset((options.page - 1) * options.pageSize),
				db.select({ value: count() }).from(projectUpdates).where(where),
			]);
			return {
				items: rows.map(toProjectUpdateDto),
				total: totals[0]?.value ?? 0,
				page: options.page,
				pageSize: options.pageSize,
			};
		},

		findForProject: async (
			orgId: string,
			projectId: string,
			id: string,
		): Promise<ProjectUpdateDto | null> => {
			const row = await db
				.select(UPDATE_SELECT)
				.from(projectUpdates)
				.leftJoin(user, eq(user.id, projectUpdates.authorId))
				.where(and(projectScope(orgId, projectId), eq(projectUpdates.id, id)))
				.get();
			return row ? toProjectUpdateDto(row) : null;
		},

		create: async (data: {
			id: string;
			orgId: string;
			projectId: string;
			authorId: string | null;
			body: string;
			health: string | null;
		}): Promise<ProjectUpdateDto> => {
			const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
				db.insert(projectUpdates).values(data),
			];
			if (data.health !== null) {
				statements.push(
					syncProjectHealthStatement(data.orgId, data.projectId, data.health),
				);
			}
			await db.batch(statements);
			// Re-read so the author projection matches list responses.
			const created = await db
				.select(UPDATE_SELECT)
				.from(projectUpdates)
				.leftJoin(user, eq(user.id, projectUpdates.authorId))
				.where(
					and(
						eq(projectUpdates.orgId, data.orgId),
						eq(projectUpdates.id, data.id),
					),
				)
				.get();
			if (!created) {
				throw new Error(`Project update ${data.id} not found after insert`);
			}
			return toProjectUpdateDto(created);
		},

		update: async (
			orgId: string,
			projectId: string,
			id: string,
			patch: Partial<{ body: string; health: string | null }>,
		): Promise<ProjectUpdateDto | null> => {
			const patchEntries = Object.fromEntries(
				Object.entries(patch).filter(([, value]) => value !== undefined),
			);
			const statements: BatchItem<"sqlite">[] = [];
			if (Object.keys(patchEntries).length > 0) {
				statements.push(
					db
						.update(projectUpdates)
						.set(patchEntries)
						.where(
							and(projectScope(orgId, projectId), eq(projectUpdates.id, id)),
						),
				);
			}
			if (typeof patch.health === "string") {
				statements.push(
					syncProjectHealthStatement(orgId, projectId, patch.health),
				);
			}
			if (statements.length > 0) {
				await db.batch(
					statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
				);
			}
			const row = await db
				.select(UPDATE_SELECT)
				.from(projectUpdates)
				.leftJoin(user, eq(user.id, projectUpdates.authorId))
				.where(and(projectScope(orgId, projectId), eq(projectUpdates.id, id)))
				.get();
			return row ? toProjectUpdateDto(row) : null;
		},

		/**
		 * Deleting a report intentionally does not roll `projects.health` back
		 * to an earlier report: the rollup only moves forward when a report is
		 * written (or when the project is edited directly).
		 */
		delete: async (
			orgId: string,
			projectId: string,
			id: string,
		): Promise<boolean> => {
			const rows = await db
				.delete(projectUpdates)
				.where(and(projectScope(orgId, projectId), eq(projectUpdates.id, id)))
				.returning({ id: projectUpdates.id });
			return rows.length > 0;
		},
	};
};

export type ProjectUpdateDao = ReturnType<typeof createProjectUpdateDao>;
