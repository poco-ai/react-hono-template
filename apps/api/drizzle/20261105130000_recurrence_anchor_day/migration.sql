ALTER TABLE `issue_recurrences` ADD `anchor_day` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Backfill existing rows with the UTC day-of-month they were scheduled on so
-- monthly recurrences keep their anchor instead of drifting.
UPDATE `issue_recurrences`
SET `anchor_day` = CAST(strftime('%d', `next_run_at` / 1000, 'unixepoch') AS integer);