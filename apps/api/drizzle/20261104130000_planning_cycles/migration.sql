CREATE TABLE `cycles` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`number` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_cycles_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_cycles_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_cycles_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `project_updates` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`health` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_project_updates_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_project_updates_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_project_updates_author_id_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `issues` ADD `cycle_id` text REFERENCES cycles(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `health` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `target_date` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `lead_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cycles_projectId_number_uq` ON `cycles` (`project_id`,`number`);--> statement-breakpoint
CREATE INDEX `cycles_projectId_startsAt_idx` ON `cycles` (`project_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `issues_orgId_cycleId_idx` ON `issues` (`org_id`,`cycle_id`);--> statement-breakpoint
CREATE INDEX `projectUpdates_projectId_createdAt_idx` ON `project_updates` (`project_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `projectUpdates_orgId_idx` ON `project_updates` (`org_id`);