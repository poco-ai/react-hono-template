import type { FavoriteEntityType } from "@workspace/shared";
import { and, desc, eq } from "drizzle-orm";
import { favorites } from "../db/schema";
import type { Database } from "../db/types";
import type { FavoriteDto } from "../dto/favorite.dto";

type FavoriteRow = typeof favorites.$inferSelect;

const toFavoriteDto = (row: FavoriteRow): FavoriteDto => ({
	...row,
	entityType: row.entityType as FavoriteEntityType,
	createdAt: row.createdAt.toISOString(),
});

/**
 * Owner-scoped favorites. Every statement filters by orgId *and* userId, so a
 * favorite id can never be used to read or delete another member's row.
 */
export const createFavoriteDao = (db: Database) => {
	const scope = (
		orgId: string,
		userId: string,
		entityType: FavoriteEntityType,
		entityId: string,
	) =>
		and(
			eq(favorites.orgId, orgId),
			eq(favorites.userId, userId),
			eq(favorites.entityType, entityType),
			eq(favorites.entityId, entityId),
		);

	return {
		listByUser: async (
			orgId: string,
			userId: string,
		): Promise<FavoriteDto[]> => {
			const rows = await db
				.select()
				.from(favorites)
				.where(and(eq(favorites.orgId, orgId), eq(favorites.userId, userId)))
				.orderBy(desc(favorites.createdAt), desc(favorites.id));
			return rows.map(toFavoriteDto);
		},

		find: async (
			orgId: string,
			userId: string,
			entityType: FavoriteEntityType,
			entityId: string,
		): Promise<FavoriteDto | null> => {
			const row = await db
				.select()
				.from(favorites)
				.where(scope(orgId, userId, entityType, entityId))
				.get();
			return row ? toFavoriteDto(row) : null;
		},

		/** Idempotent: an existing (user, type, entity) favorite is returned as is. */
		insertIfAbsent: async (data: {
			id: string;
			orgId: string;
			userId: string;
			entityType: FavoriteEntityType;
			entityId: string;
		}): Promise<FavoriteDto> => {
			const inserted = await db
				.insert(favorites)
				.values(data)
				.onConflictDoNothing()
				.returning()
				.get();
			if (inserted) {
				return toFavoriteDto(inserted);
			}
			const existing = await db
				.select()
				.from(favorites)
				.where(scope(data.orgId, data.userId, data.entityType, data.entityId))
				.get();
			if (!existing) {
				throw new Error("Favorite insert conflicted but the row is missing");
			}
			return toFavoriteDto(existing);
		},

		/** Returns whether a row existed; deleting twice is a no-op. */
		remove: async (
			orgId: string,
			userId: string,
			entityType: FavoriteEntityType,
			entityId: string,
		): Promise<boolean> => {
			const rows = await db
				.delete(favorites)
				.where(scope(orgId, userId, entityType, entityId))
				.returning({ id: favorites.id });
			return rows.length > 0;
		},
	};
};

export type FavoriteDao = ReturnType<typeof createFavoriteDao>;
