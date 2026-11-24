import type { SchemaKit } from "../../db/kit";

/** Issue attachments, pending uploads and derived media assets. */
export const defineAttachmentsTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, uniqueIndex, timestampDefault } =
		kit;

	const attachments = sqliteTable(
		"attachments",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(kit.ref("issues", "id"), { onDelete: "cascade" }),
			uploaderId: text("uploader_id").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			commentId: text("comment_id").references(kit.ref("comments", "id"), {
				onDelete: "cascade",
			}),
			key: text("key").notNull(),
			filename: text("filename").notNull(),
			contentType: text("content_type").notNull(),
			size: integer("size").notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("attachments_key_uq").on(table.key),
			index("attachments_issueId_idx").on(table.issueId),
			index("attachments_orgId_createdAt_idx").on(table.orgId, table.createdAt),
			index("attachments_commentId_idx").on(table.commentId),
		],
	);

	const pendingUploads = sqliteTable(
		"pending_uploads",
		{
			id: text("id").primaryKey(),
			key: text("key").notNull(),
			kind: text("kind").notNull(),
			orgId: text("org_id").references(kit.ref("organization", "id"), {
				onDelete: "cascade",
			}),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
			targetId: text("target_id"),
			declaredSize: integer("declared_size").notNull(),
			contentType: text("content_type").notNull(),
			expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("pending_uploads_key_uq").on(table.key),
			index("pending_uploads_orgId_expiresAt_idx").on(
				table.orgId,
				table.expiresAt,
			),
			index("pending_uploads_expiresAt_idx").on(table.expiresAt),
		],
	);

	const mediaAssets = sqliteTable(
		"media_assets",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id").references(kit.ref("organization", "id"), {
				onDelete: "cascade",
			}),
			ownerUserId: text("owner_user_id").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			kind: text("kind").notNull(),
			key: text("key").notNull(),
			filename: text("filename"),
			contentType: text("content_type").notNull(),
			size: integer("size").notNull(),
			supersededAt: integer("superseded_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("media_assets_key_uq").on(table.key),
			index("media_assets_orgId_kind_idx").on(table.orgId, table.kind),
			index("media_assets_ownerUserId_kind_idx").on(
				table.ownerUserId,
				table.kind,
			),
			index("media_assets_supersededAt_idx").on(table.supersededAt),
		],
	);

	return {
		attachments,
		pendingUploads,
		mediaAssets,
	};
};
