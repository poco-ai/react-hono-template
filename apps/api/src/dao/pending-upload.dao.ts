import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { pendingUploads } from "../db/schema";
import type { Database } from "../db/types";
import { QUOTA_UPLOAD_KINDS, type UploadKind } from "../lib/storage/uploads";

export type PendingUploadRow = {
	id: string;
	key: string;
	kind: string;
	orgId: string | null;
	userId: string;
	targetId: string | null;
	declaredSize: number;
	contentType: string;
	expiresAt: Date;
	createdAt: Date;
};

const numeric = (value: unknown) => Number(value ?? 0);

export const createPendingUploadDao = (db: Database) => ({
	create: async (data: {
		id: string;
		key: string;
		kind: UploadKind;
		orgId: string | null;
		userId: string;
		targetId: string | null;
		declaredSize: number;
		contentType: string;
		expiresAt: Date;
	}): Promise<void> => {
		await db.insert(pendingUploads).values(data);
	},

	findByKey: async (key: string): Promise<PendingUploadRow | null> => {
		const row = await db
			.select()
			.from(pendingUploads)
			.where(eq(pendingUploads.key, key))
			.get();
		return row ?? null;
	},

	deleteByKey: async (key: string): Promise<void> => {
		await db.delete(pendingUploads).where(eq(pendingUploads.key, key));
	},

	deleteByKeyIfExpired: async (key: string, now: Date): Promise<boolean> => {
		const rows = await db
			.delete(pendingUploads)
			.where(
				and(eq(pendingUploads.key, key), lt(pendingUploads.expiresAt, now)),
			)
			.returning({ key: pendingUploads.key });
		return rows.length > 0;
	},

	findExpired: async (
		now: Date,
		limit: number,
	): Promise<PendingUploadRow[]> => {
		return db
			.select()
			.from(pendingUploads)
			.where(lt(pendingUploads.expiresAt, now))
			.orderBy(asc(pendingUploads.expiresAt))
			.limit(limit);
	},

	sumDeclaredSizeByOrg: async (orgId: string, now: Date): Promise<number> => {
		const row = await db
			.select({
				value: sql<number>`coalesce(sum(${pendingUploads.declaredSize}), 0)`,
			})
			.from(pendingUploads)
			.where(
				and(
					eq(pendingUploads.orgId, orgId),
					gt(pendingUploads.expiresAt, now),
					inArray(pendingUploads.kind, [...QUOTA_UPLOAD_KINDS]),
				),
			)
			.get();
		return numeric(row?.value);
	},

	countByTarget: async (
		orgId: string,
		kind: UploadKind,
		targetId: string,
		now: Date,
	): Promise<number> => {
		const row = await db
			.select({
				value: sql<number>`count(*)`,
			})
			.from(pendingUploads)
			.where(
				and(
					eq(pendingUploads.orgId, orgId),
					eq(pendingUploads.kind, kind),
					eq(pendingUploads.targetId, targetId),
					gt(pendingUploads.expiresAt, now),
				),
			)
			.get();
		return numeric(row?.value);
	},
});

export type PendingUploadDao = ReturnType<typeof createPendingUploadDao>;
