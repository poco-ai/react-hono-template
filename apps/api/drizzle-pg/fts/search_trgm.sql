-- Re-runnable trigram indexes for PostgreSQL search.
-- SQLite keeps FTS5 in drizzle/fts/search_fts.sql. Ranking on PostgreSQL is
-- `updated_at`, not bm25. Terms of three or more characters use ILIKE, which
-- these GIN indexes can accelerate; shorter terms use strpos.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS issues_title_trgm
	ON issues USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS issues_description_trgm
	ON issues USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS comments_body_trgm
	ON comments USING gin (body gin_trgm_ops);
