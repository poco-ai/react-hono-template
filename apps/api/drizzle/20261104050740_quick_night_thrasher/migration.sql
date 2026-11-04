CREATE TABLE `comment_mentions` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `comment_mentions_pk` PRIMARY KEY(`comment_id`, `user_id`),
	CONSTRAINT `fk_comment_mentions_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comment_mentions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `comment_reactions` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `comment_reactions_pk` PRIMARY KEY(`comment_id`, `user_id`, `emoji`),
	CONSTRAINT `fk_comment_reactions_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comment_reactions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `issue_subscriptions` (
	`issue_id` text NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`reason` text DEFAULT 'manual' NOT NULL,
	`muted` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `issue_subscriptions_pk` PRIMARY KEY(`issue_id`, `user_id`),
	CONSTRAINT `fk_issue_subscriptions_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_subscriptions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_subscriptions_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`issue_id` text NOT NULL,
	`comment_id` text,
	`activity_id` text,
	`actor_id` text,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_notifications_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notifications_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notifications_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notifications_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_notifications_activity_id_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_notifications_actor_id_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `comments` ADD `parent_id` text REFERENCES comments(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `comments` ADD `resolved_at` integer;--> statement-breakpoint
ALTER TABLE `comments` ADD `resolved_by_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `commentMentions_userId_idx` ON `comment_mentions` (`user_id`);--> statement-breakpoint
CREATE INDEX `commentReactions_commentId_idx` ON `comment_reactions` (`comment_id`);--> statement-breakpoint
CREATE INDEX `comments_parentId_idx` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE INDEX `issueSubscriptions_orgId_userId_idx` ON `issue_subscriptions` (`org_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `issueSubscriptions_issueId_idx` ON `issue_subscriptions` (`issue_id`);--> statement-breakpoint
CREATE INDEX `notifications_userId_createdAt_idx` ON `notifications` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `notifications_userId_readAt_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_orgId_userId_idx` ON `notifications` (`org_id`,`user_id`);