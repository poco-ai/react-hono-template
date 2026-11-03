CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`context_type` text,
	`context_id` text,
	`pinned` integer DEFAULT false NOT NULL,
	`model` text,
	`last_message_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_ai_conversations_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ai_conversations_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`context` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_ai_messages_conversation_id_ai_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ai_messages_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ai_messages_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `ai_tool_calls` (
	`id` text PRIMARY KEY,
	`org_id` text NOT NULL,
	`user_id` text,
	`conversation_id` text,
	`surface` text NOT NULL,
	`tool_name` text NOT NULL,
	`effect` text NOT NULL,
	`status` text DEFAULT 'succeeded' NOT NULL,
	`input_hash` text,
	`input_summary` text,
	`idempotency_key` text,
	`error_code` text,
	`duration_ms` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_ai_tool_calls_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ai_tool_calls_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_ai_tool_calls_conversation_id_ai_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `ai_usage_daily` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`tool_calls` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `ai_usage_daily_pk` PRIMARY KEY(`org_id`, `user_id`, `day`),
	CONSTRAINT `fk_ai_usage_daily_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ai_usage_daily_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `org_ai_settings` (
	`org_id` text PRIMARY KEY,
	`enabled` integer DEFAULT true NOT NULL,
	`default_model` text,
	`retention_days` integer DEFAULT 30 NOT NULL,
	`strict_mcp_writes` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_org_ai_settings_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_org_ai_settings_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `source` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `scopes` text DEFAULT '["read","write"]' NOT NULL;--> statement-breakpoint
CREATE INDEX `aiConversations_orgId_userId_idx` ON `ai_conversations` (`org_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `aiConversations_orgId_lastMessageAt_idx` ON `ai_conversations` (`org_id`,"last_message_at" desc);--> statement-breakpoint
CREATE INDEX `aiMessages_conversationId_createdAt_idx` ON `ai_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `aiMessages_orgId_idx` ON `ai_messages` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `aiToolCalls_orgId_idempotencyKey_uq` ON `ai_tool_calls` (`org_id`,`idempotency_key`) WHERE "ai_tool_calls"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX `aiToolCalls_orgId_createdAt_idx` ON `ai_tool_calls` (`org_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `aiUsageDaily_orgId_day_idx` ON `ai_usage_daily` (`org_id`,`day`);