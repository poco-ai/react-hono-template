CREATE TABLE `subscriptions` (
	`org_id` text PRIMARY KEY,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`seats` integer DEFAULT 0 NOT NULL,
	`current_period_end` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_subscriptions_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `frozen` integer DEFAULT false NOT NULL;