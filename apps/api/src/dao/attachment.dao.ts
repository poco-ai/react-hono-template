import { and, desc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { user } from "../db/auth-schema";
import { attachments } from "../db/schema";
import type { Database } from "../db/types";
import type { AttachmentDto } from "../dto/attachment.dto";
import { type ActivityInsert, activityInsertStatement } from "./activity.dao";

const ATTACHMENT_SELECT = {
	id: attachments.id,
	orgId: attachments.orgId,
	issueId: attachments.issueId,
	key: attachments.key,
	filename: attachments.filename,
	contentType: attachments.contentType,
	size: attachments.size,
	createdAt: attachments.createdAt,
	// Joined columns need unique SQL names — see drizzle-orm#6038.
	uploader: {
		id: user.id.as("uploader_user_id"),
		name: user.name.as("uploader_user_name"),
		email: user.email.as("uploader_user_email"),
		image: user.image.as("uploader_user_image"),
	},
};

type AttachmentJoinRow = {
	id: string;
	orgId: string;
	issueId: string;
	key: string;
	filename: string;
	contentType: string;
	size: number;
	createdAt: Date;
	uploader: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
};

const toAttachmentDto = (row: AttachmentJoinRow): AttachmentDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
});

export const createAttachmentDao = (db: Database) => ({
	listByIssue: async (
		orgId: string,
		issueId: string,
	): Promise<AttachmentDto[]> => {
		const rows = await db
			.select(ATTACHMENT_SELECT)
			.from(attachments)
			.leftJoin(user, eq(user.id, attachments.uploaderId))
			.where(
				and(eq(attachments.orgId, orgId), eq(attachments.issueId, issueId)),
			)
			.orderBy(desc(attachments.createdAt), desc(attachments.id));
		return rows.map(toAttachmentDto);
	},

	findById: async (
		orgId: string,
		id: string,
	): Promise<AttachmentDto | null> => {
		const row = await db
			.select(ATTACHMENT_SELECT)
			.from(attachments)
			.leftJoin(user, eq(user.id, attachments.uploaderId))
			.where(and(eq(attachments.orgId, orgId), eq(attachments.id, id)))
			.get();
		return row ? toAttachmentDto(row) : null;
	},

	create: async (
		data: {
			id: string;
			orgId: string;
			issueId: string;
			uploaderId: string | null;
			key: string;
			filename: string;
			contentType: string;
			size: number;
		},
		activity?: ActivityInsert,
	): Promise<AttachmentDto> => {
		const statements = [db.insert(attachments).values(data)] as [
			BatchItem<"sqlite">,
			...BatchItem<"sqlite">[],
		];
		if (activity) {
			statements.push(activityInsertStatement(db, [activity]));
		}
		await db.batch(statements);
		const row = await db
			.select()
			.from(attachments)
			.where(
				and(eq(attachments.orgId, data.orgId), eq(attachments.id, data.id)),
			)
			.get();
		if (!row) {
			throw new Error(`Attachment ${data.id} not found after insert`);
		}
		let uploader: AttachmentJoinRow["uploader"] = null;
		if (row.uploaderId) {
			uploader =
				(await db
					.select({
						id: user.id,
						name: user.name,
						email: user.email,
						image: user.image,
					})
					.from(user)
					.where(eq(user.id, row.uploaderId))
					.get()) ?? null;
		}
		return {
			id: row.id,
			orgId: row.orgId,
			issueId: row.issueId,
			key: row.key,
			filename: row.filename,
			contentType: row.contentType,
			size: row.size,
			uploader,
			createdAt: row.createdAt.toISOString(),
		};
	},

	delete: async (
		orgId: string,
		id: string,
		activity?: ActivityInsert,
	): Promise<boolean> => {
		const statements = [
			db
				.delete(attachments)
				.where(and(eq(attachments.orgId, orgId), eq(attachments.id, id)))
				.returning({ id: attachments.id }),
		] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
		if (activity) {
			statements.push(activityInsertStatement(db, [activity]));
		}
		const [rows] = await db.batch(statements);
		return rows.length > 0;
	},
});

export type AttachmentDao = ReturnType<typeof createAttachmentDao>;
