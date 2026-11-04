CREATE TABLE `issue_relations` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`related_issue_id` text NOT NULL,
	`type` text NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_relations_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_relations_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_relations_related_issue_id_issues_id_fk` FOREIGN KEY (`related_issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_relations_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `issues` ADD `parent_id` text REFERENCES issues(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `issueRelations_issueId_relatedIssueId_type_uq` ON `issue_relations` (`issue_id`,`related_issue_id`,`type`);--> statement-breakpoint
CREATE INDEX `issueRelations_orgId_idx` ON `issue_relations` (`org_id`);--> statement-breakpoint
CREATE INDEX `issueRelations_relatedIssueId_idx` ON `issue_relations` (`related_issue_id`);--> statement-breakpoint
CREATE INDEX `issues_orgId_parentId_idx` ON `issues` (`org_id`,`parent_id`);