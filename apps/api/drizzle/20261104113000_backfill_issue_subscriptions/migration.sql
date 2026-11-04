-- Data backfill (schema unchanged): issues that predate issue_subscriptions.
-- Creators and current assignees become followers so later comments, status
-- changes and assignments reach them. Existing rows (a user who is both
-- creator and assignee) keep the first reason.
INSERT INTO `issue_subscriptions` (`issue_id`, `user_id`, `org_id`, `reason`)
SELECT `id`, `created_by_id`, `org_id`, 'creator'
FROM `issues`
WHERE `created_by_id` IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO `issue_subscriptions` (`issue_id`, `user_id`, `org_id`, `reason`)
SELECT `id`, `assignee_id`, `org_id`, 'assignee'
FROM `issues`
WHERE `assignee_id` IS NOT NULL
ON CONFLICT DO NOTHING;
