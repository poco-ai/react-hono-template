import { type IssueQuery, issueQuerySchema } from "@workspace/shared";
import { and, count, desc, eq, getTableColumns, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { views } from "../db/schema";
import type { Database } from "../db/types";
import type { ViewDto } from "../dto/view.dto";

type ViewRow = typeof views.$inferSelect;

/**
 * `query` is read as raw text so one corrupt JSON row cannot make the whole
 * list throw while drizzle decodes the column. Invalid payloads are reset to
 * an empty query below.
 */
const RAW_VIEW_COLUMNS = {
	...getTableColumns(views),
	query: sql<string>`${views.query}`,
};

type RawViewRow = Omit<ViewRow, "query"> & { query: unknown };

const parseViewQuery = (raw: unknown): IssueQuery => {
	try {
		const value = typeof raw === "string" ? JSON.parse(raw) : raw;
		const parsed = issueQuerySchema.safeParse(value ?? {});
		return parsed.success ? parsed.data : {};
	} catch {
		return {};
	}
};

const toViewDto = (row: RawViewRow): ViewDto => {
	const { query, ...rest } = row;
	return {
		...rest,
		query: parseViewQuery(query),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
};

export type ViewInsert = {
	id: string;
	orgId: string;
	projectId: string | null;
	name: string;
	description: string | null;
	ownerId: string;
	shared: boolean;
	query: ViewRow["query"];
	layout: string;
	isDefault: boolean;
};

const clearDefaultStatement = (db: Database, orgId: string, ownerId: string) =>
	db
		.update(views)
		.set({ isDefault: false })
		.where(
			and(
				eq(views.orgId, orgId),
				eq(views.ownerId, ownerId),
				eq(views.isDefault, true),
			),
		);

export const createViewDao = (db: Database) => ({
	/** Views the user can read: their own plus every shared view. */
	listVisible: async (
		orgId: string,
		userId: string,
		projectId?: string,
	): Promise<ViewDto[]> => {
		const conditions = [
			eq(views.orgId, orgId),
			or(eq(views.ownerId, userId), eq(views.shared, true)),
		];
		if (projectId) {
			conditions.push(eq(views.projectId, projectId));
		}
		const rows = await db
			.select(RAW_VIEW_COLUMNS)
			.from(views)
			.where(and(...conditions))
			.orderBy(desc(views.isDefault), desc(views.updatedAt));
		return rows.map(toViewDto);
	},

	findById: async (orgId: string, id: string): Promise<ViewDto | null> => {
		const row = await db
			.select(RAW_VIEW_COLUMNS)
			.from(views)
			.where(and(eq(views.orgId, orgId), eq(views.id, id)))
			.get();
		return row ? toViewDto(row) : null;
	},

	/** Personal (non-shared) views owned by a user, used for plan quotas. */
	countPersonal: async (orgId: string, ownerId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(views)
			.where(
				and(
					eq(views.orgId, orgId),
					eq(views.ownerId, ownerId),
					eq(views.shared, false),
				),
			);
		return row?.value ?? 0;
	},

	create: async (data: ViewInsert): Promise<ViewDto> => {
		const insert = db.insert(views).values(data).returning();
		if (!data.isDefault) {
			const rows = await insert;
			return toViewDto(rows[0]);
		}
		const [, inserted] = await db.batch([
			clearDefaultStatement(
				db,
				data.orgId,
				data.ownerId,
			) as BatchItem<"sqlite">,
			insert as BatchItem<"sqlite">,
		]);
		const rows = inserted as ViewRow[];
		return toViewDto(rows[0]);
	},

	update: async (
		orgId: string,
		id: string,
		ownerId: string,
		patch: Partial<{
			name: string;
			description: string | null;
			projectId: string | null;
			shared: boolean;
			query: ViewRow["query"];
			layout: string;
			isDefault: boolean;
		}>,
	): Promise<ViewDto | null> => {
		const patchEntries = Object.fromEntries(
			Object.entries(patch).filter(([, value]) => value !== undefined),
		);
		const scope = and(eq(views.orgId, orgId), eq(views.id, id));
		if (Object.keys(patchEntries).length === 0) {
			const current = await db.select().from(views).where(scope).get();
			return current ? toViewDto(current) : null;
		}
		if (patch.isDefault !== true) {
			const row = await db
				.update(views)
				.set(patchEntries)
				.where(scope)
				.returning()
				.get();
			return row ? toViewDto(row) : null;
		}
		const [, rows] = await db.batch([
			clearDefaultStatement(db, orgId, ownerId) as BatchItem<"sqlite">,
			db
				.update(views)
				.set(patchEntries)
				.where(scope)
				.returning() as BatchItem<"sqlite">,
		]);
		const updated = (rows as ViewRow[])[0];
		return updated ? toViewDto(updated) : null;
	},

	setDefault: async (
		orgId: string,
		id: string,
		ownerId: string,
		isDefault: boolean,
	): Promise<ViewDto | null> => {
		const scope = and(eq(views.orgId, orgId), eq(views.id, id));
		if (!isDefault) {
			const row = await db
				.update(views)
				.set({ isDefault: false })
				.where(scope)
				.returning()
				.get();
			return row ? toViewDto(row) : null;
		}
		const [, rows] = await db.batch([
			clearDefaultStatement(db, orgId, ownerId) as BatchItem<"sqlite">,
			db
				.update(views)
				.set({ isDefault: true })
				.where(scope)
				.returning() as BatchItem<"sqlite">,
		]);
		const updated = (rows as ViewRow[])[0];
		return updated ? toViewDto(updated) : null;
	},

	/** Clears the owner's default flag (at most one row by the partial index). */
	clearDefault: async (orgId: string, ownerId: string): Promise<void> => {
		await clearDefaultStatement(db, orgId, ownerId);
	},

	delete: async (orgId: string, id: string): Promise<boolean> => {
		const rows = await db
			.delete(views)
			.where(and(eq(views.orgId, orgId), eq(views.id, id)))
			.returning({ id: views.id });
		return rows.length > 0;
	},
});

export type ViewDao = ReturnType<typeof createViewDao>;
