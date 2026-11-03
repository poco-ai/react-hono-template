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
import { mediaAssets, pendingUploads } from "../db/schema";
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

	existsByKey: async (key: string): Promise<boolean> => {
		const row = await db
			.select({ id: mediaAssets.id })
			.from(mediaAssets)
			.where(eq(mediaAssets.key, key))
			.get();
		return !!row;
	},

	register: async ({
		asset,
		supersede,
		pendingKey,
		now,
	}: {
		asset: {
			id: string;
			orgId: string | null;
			ownerUserId: string | null;
			kind: MediaKind;
			key: string;
			filename: string | null;
			contentType: string;
			size: number;
		};
		supersede: { userId: string } | { orgId: string };
		pendingKey: string;
		now: Date;
	}): Promise<MediaAssetRow> => {
		const scope =
			"userId" in supersede
				? eq(mediaAssets.ownerUserId, supersede.userId)
				: eq(mediaAssets.orgId, supersede.orgId);
		// Insert, supersede the previous asset and drop the reservation in one
		// atomic batch so cleanup can never race a half-applied register.
		await db.batch([
			db.insert(mediaAssets).values(asset),
			db
				.update(mediaAssets)
				.set({ supersededAt: now })
				.where(
					and(
						scope,
						eq(mediaAssets.kind, asset.kind),
						isNull(mediaAssets.supersededAt),
						ne(mediaAssets.id, asset.id),
					),
				),
			db.delete(pendingUploads).where(eq(pendingUploads.key, pendingKey)),
		]);
		const row = await db
			.select()
			.from(mediaAssets)
			.where(eq(mediaAssets.id, asset.id))
			.get();
		if (!row) {
			throw new Error(`Media asset ${asset.id} not found after insert`);
		}
		return row;
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
