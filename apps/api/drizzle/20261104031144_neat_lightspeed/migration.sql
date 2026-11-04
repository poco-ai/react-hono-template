CREATE TABLE `issue_statuses` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_statuses_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `issues` ADD `status_id` text REFERENCES issue_statuses(id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE UNIQUE INDEX `issueStatuses_orgId_name_uq` ON `issue_statuses` (`org_id`,`name`);--> statement-breakpoint
CREATE INDEX `issueStatuses_orgId_idx` ON `issue_statuses` (`org_id`);--> statement-breakpoint
CREATE INDEX `issues_orgId_statusId_idx` ON `issues` (`org_id`,`status_id`);--> statement-breakpoint
-- Seed the six default workflow statuses for every existing organization.
INSERT INTO `issue_statuses` (`id`, `org_id`, `name`, `category`, `color`, `position`, `is_default`, `created_at`, `updated_at`)
SELECT 'sts_' || o.`id` || '_0', o.`id`, 'Backlog', 'backlog', '#64748b', 0, 1,
	cast(unixepoch('subsecond') * 1000 as integer), cast(unixepoch('subsecond') * 1000 as integer)
FROM `organization` o;--> statement-breakpoint
INSERT INTO `issue_statuses` (`id`, `org_id`, `name`, `category`, `color`, `position`, `is_default`, `created_at`, `updated_at`)
SELECT 'sts_' || o.`id` || '_1', o.`id`, 'Todo', 'unstarted', '#3b82f6', 1, 0,
	cast(unixepoch('subsecond') * 1000 as integer), cast(unixepoch('subsecond') * 1000 as integer)
FROM `organization` o;--> statement-breakpoint
INSERT INTO `issue_statuses` (`id`, `org_id`, `name`, `category`, `color`, `position`, `is_default`, `created_at`, `updated_at`)
SELECT 'sts_' || o.`id` || '_2', o.`id`, 'In Progress', 'started', '#f59e0b', 2, 0,
	cast(unixepoch('subsecond') * 1000 as integer), cast(unixepoch('subsecond') * 1000 as integer)
FROM `organization` o;--> statement-breakpoint
INSERT INTO `issue_statuses` (`id`, `org_id`, `name`, `category`, `color`, `position`, `is_default`, `created_at`, `updated_at`)
SELECT 'sts_' || o.`id` || '_3', o.`id`, 'In Review', 'started', '#a855f7', 3, 0,
	cast(unixepoch('subsecond') * 1000 as integer), cast(unixepoch('subsecond') * 1000 as integer)
FROM `organization` o;--> statement-breakpoint
INSERT INTO `issue_statuses` (`id`, `org_id`, `name`, `category`, `color`, `position`, `is_default`, `created_at`, `updated_at`)
SELECT 'sts_' || o.`id` || '_4', o.`id`, 'Done', 'completed', '#22c55e', 4, 0,
	cast(unixepoch('subsecond') * 1000 as integer), cast(unixepoch('subsecond') * 1000 as integer)
FROM `organization` o;--> statement-breakpoint
INSERT INTO `issue_statuses` (`id`, `org_id`, `name`, `category`, `color`, `position`, `is_default`, `created_at`, `updated_at`)
SELECT 'sts_' || o.`id` || '_5', o.`id`, 'Canceled', 'canceled', '#94a3b8', 5, 0,
	cast(unixepoch('subsecond') * 1000 as integer), cast(unixepoch('subsecond') * 1000 as integer)
FROM `organization` o;--> statement-breakpoint
-- Backfill existing issues from the legacy status code to the seeded status.
UPDATE `issues`
SET `status_id` = (
	SELECT s.`id`
	FROM `issue_statuses` s
	WHERE s.`org_id` = `issues`.`org_id`
		AND s.`name` = CASE `issues`.`status`
			WHEN 'backlog' THEN 'Backlog'
			WHEN 'todo' THEN 'Todo'
			WHEN 'in_progress' THEN 'In Progress'
			WHEN 'in_review' THEN 'In Review'
			WHEN 'done' THEN 'Done'
			WHEN 'canceled' THEN 'Canceled'
			ELSE 'Backlog'
		END
	LIMIT 1
)
WHERE `status_id` IS NULL;--> statement-breakpoint
-- Fallback for any legacy value outside the enum: use the organization default.
UPDATE `issues`
SET `status_id` = (
	SELECT s.`id`
	FROM `issue_statuses` s
	WHERE s.`org_id` = `issues`.`org_id` AND s.`is_default` = 1
	LIMIT 1
)
WHERE `status_id` IS NULL;