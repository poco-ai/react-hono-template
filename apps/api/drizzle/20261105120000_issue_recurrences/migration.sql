CREATE TABLE `issue_recurrences` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status_id` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`assignee_id` text,
	`label_ids` text DEFAULT '[]' NOT NULL,
	`estimate` integer,
	`cadence` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_recurrences_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_recurrences_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_recurrences_status_id_issue_statuses_id_fk` FOREIGN KEY (`status_id`) REFERENCES `issue_statuses`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issue_recurrences_assignee_id_user_id_fk` FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issue_recurrences_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `issueRecurrences_orgId_nextRunAt_idx` ON `issue_recurrences` (`org_id`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `issueRecurrences_projectId_idx` ON `issue_recurrences` (`project_id`);