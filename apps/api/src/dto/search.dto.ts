import type {
	SearchCommentHit,
	SearchIssueHit,
	SearchMemberHit,
	SearchProjectHit,
	SearchResults,
	SearchResultUser,
} from "@workspace/shared";

/**
 * Command-palette search results. Every section is independently capped by the
 * requested limit. Member hits never expose email addresses even though email
 * is part of the match; comments carry their issue reference so the client can
 * navigate to `#comment-<id>`.
 *
 * The single definition lives in `@workspace/shared` (`searchResultsSchema`):
 * the API answers with these shapes and the web palette parses them with the
 * same schema, so the two can no longer drift. Notable wire rules: `identifier`
 * (`WEB-12`) is synthesized from `projectKey` + `number` when absent,
 * excerpt-style fields are `null` when empty, and an unknown `statusCategory`
 * falls back to `unstarted`.
 */
export type SearchResultUserDto = SearchResultUser;

export type SearchIssueHitDto = SearchIssueHit;

export type SearchCommentHitDto = SearchCommentHit;

export type SearchProjectHitDto = SearchProjectHit;

export type SearchMemberHitDto = SearchMemberHit;

export type SearchResultsDto = SearchResults;
