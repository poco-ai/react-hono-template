import { and, count, desc, eq, isNull } from "drizzle-orm";
import { apiKeys } from "../db/schema";
import type { Database } from "../db/types";
import type { ApiKeyDto, ListApiKeysDto } from "../dto/api-key.dto";

type ApiKeyRow = typeof apiKeys.$inferSelect;

const LIST_COLUMNS = {
	id: apiKeys.id,
	orgId: apiKeys.orgId,
	name: apiKeys.name,
	prefix: apiKeys.prefix,
	createdById: apiKeys.createdById,
	lastUsedAt: apiKeys.lastUsedAt,
	revokedAt: apiKeys.revokedAt,
	createdAt: apiKeys.createdAt,
	updatedAt: apiKeys.updatedAt,
};

type ListRow = {
	id: string;
	orgId: string;
	name: string;
	prefix: string;
	createdById: string | null;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

const toApiKeyDto = (row: ListRow): ApiKeyDto => ({
	id: row.id,
	orgId: row.orgId,
	name: row.name,
	prefix: row.prefix,
	createdById: row.createdById,
	lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
	revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export type ApiKeyInsert = {
	id: string;
	orgId: string;
	name: string;
	prefix: string;
	keyHash: string;
	createdById: string | null;
};

export const createApiKeyDao = (db: Database) => ({
	create: async (data: ApiKeyInsert): Promise<ApiKeyDto> => {
		const row = await db.insert(apiKeys).values(data).returning().get();
		return toApiKeyDto(row);
	},

	findById: async (orgId: string, id: string): Promise<ApiKeyDto | null> => {
		const row = await db
			.select(LIST_COLUMNS)
			.from(apiKeys)
			.where(
				and(
					eq(apiKeys.orgId, orgId),
					eq(apiKeys.id, id),
					isNull(apiKeys.revokedAt),
				),
			)
			.get();
		return row ? toApiKeyDto(row) : null;
	},

	findByHash: async (keyHash: string): Promise<ApiKeyRow | null> => {
		const row = await db
			.select()
			.from(apiKeys)
			.where(eq(apiKeys.keyHash, keyHash))
			.get();
		return row ?? null;
	},

	listByOrg: async (
		orgId: string,
		page: number,
		pageSize: number,
	): Promise<ListApiKeysDto> => {
		const where = eq(apiKeys.orgId, orgId);
		const [rows, totals] = await db.batch([
			db
				.select(LIST_COLUMNS)
				.from(apiKeys)
				.where(where)
				.orderBy(desc(apiKeys.createdAt))
				.limit(pageSize)
				.offset((page - 1) * pageSize),
			db.select({ value: count() }).from(apiKeys).where(where),
		]);
		return {
			items: rows.map(toApiKeyDto),
			total: totals[0]?.value ?? 0,
			page,
			pageSize,
		};
	},

	touchLastUsed: async (id: string): Promise<void> => {
		await db
			.update(apiKeys)
			.set({ lastUsedAt: new Date() })
			.where(eq(apiKeys.id, id));
	},

	revoke: async (orgId: string, id: string): Promise<boolean> => {
		const rows = await db
			.update(apiKeys)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(apiKeys.orgId, orgId),
					eq(apiKeys.id, id),
					isNull(apiKeys.revokedAt),
				),
			)
			.returning({ id: apiKeys.id });
		return rows.length > 0;
	},
});

export type ApiKeyDao = ReturnType<typeof createApiKeyDao>;
