import type { SearchQueryInput } from "@workspace/shared";
import { SEARCH_MAX_LIMIT } from "@workspace/shared";
import type { SearchDao } from "../dao/search.dao";
import type { SearchResultsDto } from "../dto/search.dto";
import { buildSearchTerms } from "../lib/search";

const EMPTY_RESULTS: SearchResultsDto = {
	issues: [],
	comments: [],
	projects: [],
	members: [],
};

/**
 * Unified organization search used by the command palette and the `search_all`
 * capability. Issues and comments are full-text (FTS5 trigram); projects and
 * members use `instr()` matches. An empty query returns empty sections instead
 * of an error, and every section is capped independently by `limit`.
 */
export const createSearchService = (searchDao: SearchDao) => ({
	searchAll: async (
		orgId: string,
		input: SearchQueryInput,
	): Promise<SearchResultsDto> => {
		const terms = buildSearchTerms(input.q);
		if (terms.tokens.length === 0) {
			return { ...EMPTY_RESULTS };
		}
		// Defence in depth: callers already validate the range, but the service
		// never runs an unbounded per-section query.
		const limit = Math.min(Math.max(input.limit, 1), SEARCH_MAX_LIMIT);
		const [issues, comments, projects, members] = await Promise.all([
			searchDao.searchIssues(orgId, terms, limit),
			searchDao.searchComments(orgId, terms, limit),
			searchDao.searchProjects(orgId, terms, limit),
			searchDao.searchMembers(orgId, terms, limit),
		]);
		return { issues, comments, projects, members };
	},
});

export type SearchService = ReturnType<typeof createSearchService>;
