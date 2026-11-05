import { z } from "zod";
import { STATUS_CATEGORIES } from "../constants";

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

// --- responses -------------------------------------------------------------
//
// The parse is deliberately lenient: the palette must keep rendering whatever
// valid rows a partial or older payload contains. Text fields missing from the
// wire become `""`, empty excerpts/colors become `null`, numbers are coerced
// (D1 may return them as strings), and a single malformed row is dropped
// without failing its siblings. Only the identity of a hit (`id`, parent ids,
// `title`, `body`, `number`) is required; anything else has a fallback.

/** Category used when a hit carries a missing or unknown `statusCategory`. */
const SEARCH_FALLBACK_STATUS_CATEGORY = "unstarted";

/** Wire text that may be absent, `null` or non-string on older payloads. */
const searchTextSchema = z.string().catch("");

/** Text where an empty/missing value means "nothing to show". */
const searchNullableTextSchema = searchTextSchema.transform(
	(value) => value || null,
);

/** Positive hit numbers; numeric strings from D1 are accepted. */
const searchHitNumberSchema = z.coerce.number().finite().positive();

/**
 * Status categories are a closed set, but the value is typed as `string`
 * because the DAO reads it from a raw SQL column; unknown values collapse to
 * `unstarted` instead of dropping the hit.
 */
const searchStatusCategorySchema = searchTextSchema.transform(
	(value): string =>
		(STATUS_CATEGORIES as readonly string[]).includes(value)
			? value
			: SEARCH_FALLBACK_STATUS_CATEGORY,
);

/**
 * Minimal user reference embedded in hits (assignee, comment author). `image`
 * degrades to `null`; an entry without an id or name is malformed.
 */
export const searchResultUserSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	image: searchNullableTextSchema,
});

export type SearchResultUser = z.infer<typeof searchResultUserSchema>;

/**
 * Issue hit. `identifier` (`WEB-12`) is synthesized from `projectKey` and
 * `number` when the payload omits it, and `assignee` degrades to `null` rather
 * than dropping the issue.
 */
export const searchIssueHitSchema = z
	.object({
		id: z.string().min(1),
		projectId: z.string().min(1),
		projectKey: searchTextSchema,
		number: searchHitNumberSchema,
		identifier: searchTextSchema,
		title: z.string().min(1),
		descriptionExcerpt: searchNullableTextSchema,
		statusId: searchTextSchema,
		statusName: searchTextSchema,
		statusColor: searchTextSchema,
		statusCategory: searchStatusCategorySchema,
		priority: z.coerce.number().catch(0),
		assignee: searchResultUserSchema.nullable().catch(null),
		updatedAt: searchTextSchema,
	})
	.transform((hit) => ({
		...hit,
		identifier: hit.identifier || `${hit.projectKey}-${hit.number}`,
	}));

export type SearchIssueHit = z.infer<typeof searchIssueHitSchema>;

/** Issue reference carried by a comment hit; `identifier` falls back the same way. */
const searchCommentIssueSchema = z
	.object({
		id: searchTextSchema,
		projectId: z.string().min(1),
		projectKey: searchTextSchema,
		number: searchHitNumberSchema,
		identifier: searchTextSchema,
		title: searchTextSchema,
	})
	.transform((issue) => ({
		...issue,
		identifier: issue.identifier || `${issue.projectKey}-${issue.number}`,
	}));

/**
 * Comment hit. `body` is already an excerpt; a missing author degrades to an
 * empty reference so the palette can still navigate to the comment.
 */
export const searchCommentHitSchema = z.object({
	id: z.string().min(1),
	body: z.string().min(1),
	author: searchResultUserSchema.catch(() => ({
		id: "",
		name: "",
		image: null,
	})),
	issue: searchCommentIssueSchema,
	createdAt: searchTextSchema,
});

export type SearchCommentHit = z.infer<typeof searchCommentHitSchema>;

/** Project hit; only an explicit `true` marks it archived. */
export const searchProjectHitSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	key: searchTextSchema,
	descriptionExcerpt: searchNullableTextSchema,
	color: searchNullableTextSchema,
	archived: z.boolean().catch(false),
	updatedAt: searchTextSchema,
});

export type SearchProjectHit = z.infer<typeof searchProjectHitSchema>;

/** Member hits match users but never expose emails: same reference shape. */
export const searchMemberHitSchema = searchResultUserSchema;

export type SearchMemberHit = SearchResultUser;

/**
 * Parses one section item-by-item: malformed hits are dropped, and a missing or
 * non-array section becomes `[]`.
 */
const searchSectionSchema = <Schema extends z.ZodType>(item: Schema) =>
	z
		.array(z.unknown())
		.catch([])
		.transform((entries): z.output<Schema>[] => {
			const hits: z.output<Schema>[] = [];
			for (const entry of entries) {
				const parsed = item.safeParse(entry);
				if (parsed.success) {
					hits.push(parsed.data);
				}
			}
			return hits;
		});

/**
 * Command-palette search payload (`GET /api/orgs/:orgId/search`). Non-object
 * payloads (null, strings, arrays) parse as empty results, so `parse` never
 * throws and the palette always renders something.
 */
export const searchResultsSchema = z.preprocess(
	(value) =>
		typeof value === "object" && value !== null && !Array.isArray(value)
			? value
			: {},
	z.object({
		issues: searchSectionSchema(searchIssueHitSchema),
		comments: searchSectionSchema(searchCommentHitSchema),
		projects: searchSectionSchema(searchProjectHitSchema),
		members: searchSectionSchema(searchMemberHitSchema),
	}),
);

export type SearchResults = z.infer<typeof searchResultsSchema>;

/** Empty payload: the palette's disabled/initial state. */
export const emptySearchResults = (): SearchResults => ({
	issues: [],
	comments: [],
	projects: [],
	members: [],
});
