-- Full-text search indexes (FTS5) for issues and comments.
--
-- Drizzle-kit cannot model virtual tables, so this migration is hand-written and
-- the tables intentionally do not appear in src/db/schema.ts. External-content
-- tables (`content=`) avoid duplicating text: the FTS rows are kept in sync by
-- triggers, and soft-deleted issues stay indexed while the query joins the
-- origin table and filters `deleted_at`.
--
-- The `trigram` tokenizer supports substring (including CJK) matching for terms
-- of three or more characters; shorter terms fall back to `instr()` in the DAO.

CREATE VIRTUAL TABLE IF NOT EXISTS `issue_search` USING fts5(
	`title`,
	`description`,
	content='issues',
	content_rowid='rowid',
	tokenize='trigram'
);--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `comment_search` USING fts5(
	`body`,
	content='comments',
	content_rowid='rowid',
	tokenize='trigram'
);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `issue_search_ai` AFTER INSERT ON `issues` BEGIN
	INSERT INTO `issue_search`(`rowid`, `title`, `description`)
	VALUES (new.`rowid`, new.`title`, coalesce(new.`description`, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `issue_search_ad` AFTER DELETE ON `issues` BEGIN
	INSERT INTO `issue_search`(`issue_search`, `rowid`, `title`, `description`)
	VALUES ('delete', old.`rowid`, old.`title`, coalesce(old.`description`, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `issue_search_au` AFTER UPDATE OF `title`, `description` ON `issues` BEGIN
	INSERT INTO `issue_search`(`issue_search`, `rowid`, `title`, `description`)
	VALUES ('delete', old.`rowid`, old.`title`, coalesce(old.`description`, ''));
	INSERT INTO `issue_search`(`rowid`, `title`, `description`)
	VALUES (new.`rowid`, new.`title`, coalesce(new.`description`, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `comment_search_ai` AFTER INSERT ON `comments` BEGIN
	INSERT INTO `comment_search`(`rowid`, `body`) VALUES (new.`rowid`, new.`body`);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `comment_search_ad` AFTER DELETE ON `comments` BEGIN
	INSERT INTO `comment_search`(`comment_search`, `rowid`, `body`)
	VALUES ('delete', old.`rowid`, old.`body`);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `comment_search_au` AFTER UPDATE OF `body` ON `comments` BEGIN
	INSERT INTO `comment_search`(`comment_search`, `rowid`, `body`)
	VALUES ('delete', old.`rowid`, old.`body`);
	INSERT INTO `comment_search`(`rowid`, `body`) VALUES (new.`rowid`, new.`body`);
END;--> statement-breakpoint
-- Index rows that already exist when this migration runs.
INSERT INTO `issue_search`(`issue_search`) VALUES('rebuild');--> statement-breakpoint
INSERT INTO `comment_search`(`comment_search`) VALUES('rebuild');
