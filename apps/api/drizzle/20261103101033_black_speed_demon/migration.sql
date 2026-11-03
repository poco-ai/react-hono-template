CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY,
	`org_id` text,
	`owner_user_id` text,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`filename` text,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`superseded_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_media_assets_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_media_assets_owner_user_id_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `pending_uploads` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`org_id` text,
	`user_id` text NOT NULL,
	`target_id` text,
	`declared_size` integer NOT NULL,
	`content_type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_pending_uploads_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_pending_uploads_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `comment_id` text REFERENCES comments(id) ON DELETE CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_key_uq` ON `attachments` (`key`);--> statement-breakpoint
CREATE INDEX `attachments_orgId_createdAt_idx` ON `attachments` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attachments_commentId_idx` ON `attachments` (`comment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_key_uq` ON `media_assets` (`key`);--> statement-breakpoint
CREATE INDEX `media_assets_orgId_kind_idx` ON `media_assets` (`org_id`,`kind`);--> statement-breakpoint
CREATE INDEX `media_assets_ownerUserId_kind_idx` ON `media_assets` (`owner_user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `media_assets_supersededAt_idx` ON `media_assets` (`superseded_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `pending_uploads_key_uq` ON `pending_uploads` (`key`);--> statement-breakpoint
CREATE INDEX `pending_uploads_orgId_expiresAt_idx` ON `pending_uploads` (`org_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `pending_uploads_expiresAt_idx` ON `pending_uploads` (`expires_at`);