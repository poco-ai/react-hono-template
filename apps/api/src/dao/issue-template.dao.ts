import { and, asc, eq, isNull } from "drizzle-orm";
import { issueTemplates } from "../db/schema";
import type { Database } from "../db/types";
import type { IssueTemplateDto } from "../dto/issue-template.dto";

type TemplateRow = typeof issueTemplates.$inferSelect;

const toTemplateDto = (row: TemplateRow): IssueTemplateDto => ({
	...row,
	labelIds: row.labelIds ?? [],
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const createIssueTemplateDao = (db: Database) => {
	const scope = (orgId: string, id: string) =>
		and(eq(issueTemplates.orgId, orgId), eq(issueTemplates.id, id));

	return {
		listByOrg: async (
			orgId: string,
			projectId?: string,
		): Promise<IssueTemplateDto[]> => {
			const conditions = [eq(issueTemplates.orgId, orgId)];
			if (projectId) {
				conditions.push(eq(issueTemplates.projectId, projectId));
			}
			const rows = await db
				.select()
				.from(issueTemplates)
				.where(and(...conditions))
				.orderBy(asc(issueTemplates.name), asc(issueTemplates.id));
			return rows.map(toTemplateDto);
		},

		findById: async (
			orgId: string,
			id: string,
		): Promise<IssueTemplateDto | null> => {
			const row = await db
				.select()
				.from(issueTemplates)
				.where(scope(orgId, id))
				.get();
			return row ? toTemplateDto(row) : null;
		},

		/**
		 * Name lookup inside the template scope. SQLite treats NULLs as distinct,
		 * so organization-wide templates (projectId null) need an explicit
		 * `is null` comparison instead of `= ?`.
		 */
		findByName: async (
			orgId: string,
			projectId: string | null,
			name: string,
		): Promise<IssueTemplateDto | null> => {
			const row = await db
				.select()
				.from(issueTemplates)
				.where(
					and(
						eq(issueTemplates.orgId, orgId),
						projectId
							? eq(issueTemplates.projectId, projectId)
							: isNull(issueTemplates.projectId),
						eq(issueTemplates.name, name),
					),
				)
				.get();
			return row ? toTemplateDto(row) : null;
		},

		create: async (data: {
			id: string;
			orgId: string;
			projectId: string | null;
			name: string;
			title: string;
			description: string | null;
			statusId: string | null;
			priority: number | null;
			labelIds: string[];
			estimate: number | null;
			createdById: string | null;
		}): Promise<IssueTemplateDto> => {
			const row = await db
				.insert(issueTemplates)
				.values(data)
				.returning()
				.get();
			return toTemplateDto(row);
		},

		update: async (
			orgId: string,
			id: string,
			patch: Partial<{
				projectId: string | null;
				name: string;
				title: string;
				description: string | null;
				statusId: string | null;
				priority: number | null;
				labelIds: string[];
				estimate: number | null;
			}>,
		): Promise<IssueTemplateDto | null> => {
			const patchEntries = Object.fromEntries(
				Object.entries(patch).filter(([, value]) => value !== undefined),
			);
			if (Object.keys(patchEntries).length === 0) {
				return db
					.select()
					.from(issueTemplates)
					.where(scope(orgId, id))
					.get()
					.then((row) => (row ? toTemplateDto(row) : null));
			}
			const row = await db
				.update(issueTemplates)
				.set(patchEntries)
				.where(scope(orgId, id))
				.returning()
				.get();
			return row ? toTemplateDto(row) : null;
		},

		delete: async (orgId: string, id: string): Promise<boolean> => {
			const rows = await db
				.delete(issueTemplates)
				.where(scope(orgId, id))
				.returning({ id: issueTemplates.id });
			return rows.length > 0;
		},
	};
};

export type IssueTemplateDao = ReturnType<typeof createIssueTemplateDao>;
