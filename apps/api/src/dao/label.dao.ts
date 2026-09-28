import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { issueLabels, issues, labels } from "../db/schema";
import type { Database } from "../db/types";
import type { LabelDto } from "../dto/label.dto";

type LabelRow = typeof labels.$inferSelect;

const toLabelDto = (row: LabelRow): LabelDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const createLabelDao = (db: Database) => ({
	listByOrg: async (orgId: string): Promise<LabelDto[]> => {
		const rows = await db.select().from(labels).where(eq(labels.orgId, orgId));
		return rows.map(toLabelDto);
	},

	findById: async (orgId: string, id: string): Promise<LabelDto | null> => {
		const row = await db
			.select()
			.from(labels)
			.where(and(eq(labels.orgId, orgId), eq(labels.id, id)))
			.get();
		return row ? toLabelDto(row) : null;
	},

	findByName: async (orgId: string, name: string): Promise<LabelDto | null> => {
		const row = await db
			.select()
			.from(labels)
			.where(and(eq(labels.orgId, orgId), eq(labels.name, name)))
			.get();
		return row ? toLabelDto(row) : null;
	},

	findByIds: async (orgId: string, ids: string[]): Promise<LabelDto[]> => {
		if (ids.length === 0) {
			return [];
		}
		const rows = await db
			.select()
			.from(labels)
			.where(and(eq(labels.orgId, orgId), inArray(labels.id, ids)));
		return rows.map(toLabelDto);
	},

	create: async (data: {
		id: string;
		orgId: string;
		name: string;
		color: string;
	}): Promise<LabelDto> => {
		const row = await db.insert(labels).values(data).returning().get();
		return toLabelDto(row);
	},

	update: async (
		orgId: string,
		id: string,
		patch: Partial<{ name: string; color: string }>,
	): Promise<LabelDto | null> => {
		const patchEntries = Object.fromEntries(
			Object.entries(patch).filter(([, value]) => value !== undefined),
		) as Partial<{ name: string; color: string }>;
		if (Object.keys(patchEntries).length === 0) {
			const current = await db
				.select()
				.from(labels)
				.where(and(eq(labels.orgId, orgId), eq(labels.id, id)))
				.get();
			return current ? toLabelDto(current) : null;
		}
		const row = await db
			.update(labels)
			.set(patchEntries)
			.where(and(eq(labels.orgId, orgId), eq(labels.id, id)))
			.returning()
			.get();
		return row ? toLabelDto(row) : null;
	},

	delete: async (orgId: string, id: string): Promise<boolean> => {
		const rows = await db
			.delete(labels)
			.where(and(eq(labels.orgId, orgId), eq(labels.id, id)))
			.returning({ id: labels.id });
		return rows.length > 0;
	},

	countIssueReferences: async (orgId: string, id: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(issueLabels)
			.innerJoin(issues, eq(issues.id, issueLabels.issueId))
			.where(
				and(
					eq(issues.orgId, orgId),
					eq(issueLabels.labelId, id),
					isNull(issues.deletedAt),
				),
			);
		return row?.value ?? 0;
	},
});

export type LabelDao = ReturnType<typeof createLabelDao>;
