-- Rebuild `issues` to enforce status_id NOT NULL and drop the legacy `status`
-- column. DROP TABLE on a parent table cascades into comments/attachments/
-- issue_labels/activities, so their rows are backed up first and restored
-- after the swap. The whole migration runs in one D1 transaction.
--
-- Release order: this migration depends on `issue_statuses` and the
-- `issues.status_id` column created by 20261104031144_neat_lightspeed, so run
-- M1 and M2 back to back against a backed-up copy/preview database first, then
-- deploy the new Worker. Do not deploy the new code while only M1 has run.
CREATE TABLE `__bak_comments` AS SELECT * FROM `comments`;--> statement-breakpoint
CREATE TABLE `__bak_attachments` AS SELECT * FROM `attachments`;--> statement-breakpoint
CREATE TABLE `__bak_issue_labels` AS SELECT * FROM `issue_labels`;--> statement-breakpoint
CREATE TABLE `__bak_activities` AS SELECT * FROM `activities`;--> statement-breakpoint
CREATE TABLE `__new_issues` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status_id` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`assignee_id` text,
	`created_by_id` text,
	`due_date` integer,
	`estimate` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issues_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issues_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issues_status_id_issue_statuses_id_fk` FOREIGN KEY (`status_id`) REFERENCES `issue_statuses`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_issues_assignee_id_user_id_fk` FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issues_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);--> statement-breakpoint
-- Defensive backfill for environments where M1 ran before the issues backfill
-- (or a write slipped in): never copy a NULL status_id into the NOT NULL table.
UPDATE `issues`
SET `status_id` = (
	SELECT s.`id`
	FROM `issue_statuses` s
	WHERE s.`org_id` = `issues`.`org_id`
	ORDER BY s.`is_default` DESC, s.`position` ASC
	LIMIT 1
)
WHERE `status_id` IS NULL;--> statement-breakpoint
INSERT INTO `__new_issues`(`id`, `org_id`, `project_id`, `number`, `title`, `description`, `status_id`, `priority`, `assignee_id`, `created_by_id`, `due_date`, `estimate`, `deleted_at`, `created_at`, `updated_at`) SELECT `id`, `org_id`, `project_id`, `number`, `title`, `description`, `status_id`, `priority`, `assignee_id`, `created_by_id`, `due_date`, `estimate`, `deleted_at`, `created_at`, `updated_at` FROM `issues`;--> statement-breakpoint
DROP TABLE `issues`;--> statement-breakpoint
ALTER TABLE `__new_issues` RENAME TO `issues`;--> statement-breakpoint
INSERT INTO `comments` SELECT * FROM `__bak_comments`;--> statement-breakpoint
INSERT INTO `attachments` SELECT * FROM `__bak_attachments`;--> statement-breakpoint
INSERT INTO `issue_labels` SELECT * FROM `__bak_issue_labels`;--> statement-breakpoint
INSERT INTO `activities` SELECT * FROM `__bak_activities`;--> statement-breakpoint
DROP TABLE `__bak_comments`;--> statement-breakpoint
DROP TABLE `__bak_attachments`;--> statement-breakpoint
DROP TABLE `__bak_issue_labels`;--> statement-breakpoint
DROP TABLE `__bak_activities`;--> statement-breakpoint
DROP INDEX IF EXISTS `issues_orgId_status_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `issues_projectId_number_uq` ON `issues` (`project_id`,`number`);--> statement-breakpoint
CREATE INDEX `issues_orgId_idx` ON `issues` (`org_id`);--> statement-breakpoint
CREATE INDEX `issues_orgId_statusId_idx` ON `issues` (`org_id`,`status_id`);--> statement-breakpoint
CREATE INDEX `issues_orgId_assigneeId_idx` ON `issues` (`org_id`,`assignee_id`);
