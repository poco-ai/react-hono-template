CREATE TABLE `views` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`description` text,
	`owner_id` text NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`query` text NOT NULL,
	`layout` text DEFAULT 'list' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_views_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_views_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_views_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `views_orgId_projectId_idx` ON `views` (`org_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `views_orgId_ownerId_idx` ON `views` (`org_id`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `views_orgId_ownerId_default_uq` ON `views` (`org_id`,`owner_id`) WHERE "views"."is_default" = 1;