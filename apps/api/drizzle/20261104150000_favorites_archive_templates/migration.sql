CREATE TABLE `favorites` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_favorites_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_favorites_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `issue_templates` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status_id` text,
	`priority` integer,
	`label_ids` text DEFAULT '[]' NOT NULL,
	`estimate` integer,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_templates_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_templates_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_templates_status_id_issue_statuses_id_fk` FOREIGN KEY (`status_id`) REFERENCES `issue_statuses`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issue_templates_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `issues` ADD `archived_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_userId_entityType_entityId_uq` ON `favorites` (`user_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `favorites_orgId_userId_idx` ON `favorites` (`org_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `issueTemplates_orgId_projectId_name_uq` ON `issue_templates` (`org_id`,`project_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `issueTemplates_orgId_name_orgLevel_uq` ON `issue_templates` (`org_id`,`name`) WHERE "issue_templates"."project_id" is null;--> statement-breakpoint
CREATE INDEX `issueTemplates_orgId_idx` ON `issue_templates` (`org_id`);--> statement-breakpoint
CREATE INDEX `issues_orgId_archivedAt_idx` ON `issues` (`org_id`,`archived_at`);