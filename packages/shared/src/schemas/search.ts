import { z } from "zod";

/**
 * Command-palette / quick search query. `q` may be empty (the API then returns
 * empty sections instead of failing); >100 characters is rejected so the FTS
 * expression and the fallback `instr()` scans stay bounded. `limit` caps each
 * section independently.
 *
 * Empty `q` is deliberately HTTP-only: the command palette sends whatever is
 * typed (including `?q=`), and an empty box must not be a 400. The `search_all`
 * AI/MCP capability uses its own schema with `min(1)` because an empty tool call
 * is a caller mistake. Control characters are stripped in `buildSearchTerms`
 * (a NUL would otherwise break the quoted FTS5 phrase) instead of rejected, so
 * both surfaces behave the same.
 */
export const SEARCH_DEFAULT_LIMIT = 8;
export const SEARCH_MAX_LIMIT = 20;
export const SEARCH_MAX_QUERY_LENGTH = 100;

export const searchQuerySchema = z.object({
	q: z.string().trim().max(SEARCH_MAX_QUERY_LENGTH).default(""),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(SEARCH_MAX_LIMIT)
		.default(SEARCH_DEFAULT_LIMIT),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
