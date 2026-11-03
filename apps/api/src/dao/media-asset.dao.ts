import {
	and,
	asc,
	eq,
	isNotNull,
	isNull,
	lt,
	ne,
	notInArray,
	sql,
} from "drizzle-orm";
import { mediaAssets } from "../db/schema";
import type { Database } from "../db/types";
import { type MediaKind, NON_QUOTA_MEDIA_KINDS } from "../lib/storage/uploads";

export type MediaAssetRow = {
	id: string;
	orgId: string | null;
	ownerUserId: string | null;
	kind: string;
	key: string;
	filename: string | null;
	contentType: string;
	size: number;
	supersededAt: Date | null;
	createdAt: Date;
};

const numeric = (value: unknown) => Number(value ?? 0);

export const createMediaAssetDao = (db: Database) => ({
	create: async (data: {
		id: string;
		orgId: string | null;
		ownerUserId: string | null;
		kind: MediaKind;
		key: string;
		filename: string | null;
		contentType: string;
		size: number;
	}): Promise<MediaAssetRow> => {
		await db.insert(mediaAssets).values(data);
		const row = await db
			.select()
			.from(mediaAssets)
			.where(eq(mediaAssets.id, data.id))
			.get();
		if (!row) {
			throw new Error(`Media asset ${data.id} not found after insert`);
		}
		return row;
	},

	findById: async (id: string): Promise<MediaAssetRow | null> => {
		const row = await db
			.select()
			.from(mediaAssets)
			.where(eq(mediaAssets.id, id))
			.get();
		return row ?? null;
	},

	findByKey: async (key: string): Promise<MediaAssetRow | null> => {
		const row = await db
			.select()
			.from(mediaAssets)
			.where(eq(mediaAssets.key, key))
			.get();
		return row ?? null;
	},

	deleteById: async (id: string): Promise<void> => {
		await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
	},

	sumActiveSizeByOrg: async (orgId: string): Promise<number> => {
		const row = await db
			.select({
				value: sql<number>`coalesce(sum(${mediaAssets.size}), 0)`,
			})
			.from(mediaAssets)
			.where(
				and(
					eq(mediaAssets.orgId, orgId),
					isNull(mediaAssets.supersededAt),
					notInArray(mediaAssets.kind, [...NON_QUOTA_MEDIA_KINDS]),
				),
			)
			.get();
		return numeric(row?.value);
	},

	supersedeForUser: async (
		userId: string,
		kind: MediaKind,
		exceptId: string,
		now: Date,
	): Promise<void> => {
		await db
			.update(mediaAssets)
			.set({ supersededAt: now })
			.where(
				and(
					eq(mediaAssets.ownerUserId, userId),
					eq(mediaAssets.kind, kind),
					isNull(mediaAssets.supersededAt),
					ne(mediaAssets.id, exceptId),
				),
			);
	},

	supersedeForOrg: async (
		orgId: string,
		kind: MediaKind,
		exceptId: string,
		now: Date,
	): Promise<void> => {
		await db
			.update(mediaAssets)
			.set({ supersededAt: now })
			.where(
				and(
					eq(mediaAssets.orgId, orgId),
					eq(mediaAssets.kind, kind),
					isNull(mediaAssets.supersededAt),
					ne(mediaAssets.id, exceptId),
				),
			);
	},

	findSupersededBefore: async (
		before: Date,
		limit: number,
	): Promise<MediaAssetRow[]> => {
		return db
			.select()
			.from(mediaAssets)
			.where(
				and(
					isNotNull(mediaAssets.supersededAt),
					lt(mediaAssets.supersededAt, before),
				),
			)
			.orderBy(asc(mediaAssets.supersededAt))
			.limit(limit);
	},
});

export type MediaAssetDao = ReturnType<typeof createMediaAssetDao>;
