-- Full-text search indexes (FTS5) for issues and comments — re-runnable.
--
-- This file is NOT a migration (wrangler only applies
-- `drizzle/*/migration.sql`). It mirrors
-- `drizzle/20261104143000_search_fts/migration.sql` and can be executed any
-- number of times: every object uses IF NOT EXISTS and the file ends with a
-- rebuild that re-syncs the external-content tables from `issues`/`comments`.
--
-- !! NEEDED AFTER EVERY TABLE REBUILD !!
-- Drizzle-kit/D1 implement "alter table" as create/copy/drop/rename, which
-- silently drops the triggers that keep the FTS index in sync (the virtual
-- tables themselves survive). Any migration that rebuilds `issues` or
-- `comments` must be followed by:
--
--   bunx wrangler d1 execute react-hono-db --local  --file=drizzle/fts/search_fts.sql
--   bunx wrangler d1 execute react-hono-db --remote --file=drizzle/fts/search_fts.sql
--
-- Do not use `drizzle-kit push` to bypass migrations: it can also rebuild
-- tables without restoring the triggers. The search tests assert the six
-- triggers exist, and `INSERT INTO ... VALUES('integrity-check')` validates the
-- index after this file ran.
--
-- Trigram tokenizer: substring (including CJK) matching for terms of three or
-- more characters; shorter terms fall back to instr() in the DAO. Soft-deleted
-- issues stay indexed and are filtered by the join on `deleted_at`.

CREATE VIRTUAL TABLE IF NOT EXISTS `issue_search` USING fts5(
	`title`,
	`description`,
	content='issues',
	content_rowid='rowid',
	tokenize='trigram'
);
CREATE VIRTUAL TABLE IF NOT EXISTS `comment_search` USING fts5(
	`body`,
	content='comments',
	content_rowid='rowid',
	tokenize='trigram'
);
CREATE TRIGGER IF NOT EXISTS `issue_search_ai` AFTER INSERT ON `issues` BEGIN
	INSERT INTO `issue_search`(`rowid`, `title`, `description`)
	VALUES (new.`rowid`, new.`title`, coalesce(new.`description`, ''));
END;
CREATE TRIGGER IF NOT EXISTS `issue_search_ad` AFTER DELETE ON `issues` BEGIN
	INSERT INTO `issue_search`(`issue_search`, `rowid`, `title`, `description`)
	VALUES ('delete', old.`rowid`, old.`title`, coalesce(old.`description`, ''));
END;
CREATE TRIGGER IF NOT EXISTS `issue_search_au` AFTER UPDATE OF `title`, `description` ON `issues` BEGIN
	INSERT INTO `issue_search`(`issue_search`, `rowid`, `title`, `description`)
	VALUES ('delete', old.`rowid`, old.`title`, coalesce(old.`description`, ''));
	INSERT INTO `issue_search`(`rowid`, `title`, `description`)
	VALUES (new.`rowid`, new.`title`, coalesce(new.`description`, ''));
END;
CREATE TRIGGER IF NOT EXISTS `comment_search_ai` AFTER INSERT ON `comments` BEGIN
	INSERT INTO `comment_search`(`rowid`, `body`) VALUES (new.`rowid`, new.`body`);
END;
CREATE TRIGGER IF NOT EXISTS `comment_search_ad` AFTER DELETE ON `comments` BEGIN
	INSERT INTO `comment_search`(`comment_search`, `rowid`, `body`)
	VALUES ('delete', old.`rowid`, old.`body`);
END;
CREATE TRIGGER IF NOT EXISTS `comment_search_au` AFTER UPDATE OF `body` ON `comments` BEGIN
	INSERT INTO `comment_search`(`comment_search`, `rowid`, `body`)
	VALUES ('delete', old.`rowid`, old.`body`);
	INSERT INTO `comment_search`(`rowid`, `body`) VALUES (new.`rowid`, new.`body`);
END;

-- Re-index every existing row (also repairs an index left stale by a rebuild).
INSERT INTO `issue_search`(`issue_search`) VALUES('rebuild');
INSERT INTO `comment_search`(`comment_search`) VALUES('rebuild');
