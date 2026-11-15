import {
	ISSUE_QUERY_GROUP_BY,
	ISSUE_QUERY_SORT_FIELDS,
	type IssueQuerySort,
	type IssueQuerySortField,
	issueQuerySortSchema,
} from "@workspace/shared";
import { z } from "zod";
import { ISSUE_LIST_DENSITIES } from "./list-preferences";

const isSortField = (value: string): value is IssueQuerySortField =>
	(ISSUE_QUERY_SORT_FIELDS as readonly string[]).includes(value);

/** A usable `sort` param: one legacy sort field or an explicit sort list. */
export type ParsedSortParam =
	| { field: IssueQuerySortField }
	| { sorts: IssueQuerySort[] };

/**
 * Parses the URL `sort` param, accepting both the legacy single key and the
 * JSON array produced when a saved view is detached from the URL. `query.ts`
 * reuses this so the schema transform and the request builder cannot drift;
 * `undefined` means "not usable, fall back to the default sort".
 */
export const parseSortParamValue = (
	value: string,
): ParsedSortParam | undefined => {
	const trimmed = value.trim();
	if (isSortField(trimmed)) {
		return { field: trimmed };
	}
	if (!trimmed.startsWith("[")) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return undefined;
	}
	if (!Array.isArray(parsed) || parsed.length === 0) {
		return undefined;
	}
	const sorts: IssueQuerySort[] = [];
	for (const entry of parsed) {
		const result = issueQuerySortSchema.safeParse(entry);
		if (!result.success) {
			return undefined;
		}
		sorts.push(result.data);
	}
	return { sorts };
};

/**
 * `sort` stays a string in the URL (legacy key or JSON array) so bookmarks and
 * saved-view writes keep their shape; invalid values fall back to `updated`.
 */
const sortParam = z
	.string()
	.transform((value) => (parseSortParamValue(value) ? value.trim() : "updated"))
	.catch("updated");

export const issueSearchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1),
	/** Selected workflow status ids (CSV). */
	statusId: z.string().optional().catch(""),
	/** @deprecated Legacy status names kept for old bookmarked URLs. */
	status: z.string().optional().catch(""),
	priority: z.string().optional().catch(""),
	assigneeId: z.string().optional().catch(""),
	labelId: z.string().optional().catch(""),
	search: z.string().optional().catch(""),
	/**
	 * Flat planning-cycle filter. Kept out of the structured `filter` JSON so
	 * the cycle card, query builders and saved views never have two sources.
	 */
	cycleId: z.string().optional().catch(""),
	sort: sortParam,
	/** Structured filter tree as a JSON string; invalid values fall back. */
	filter: z.string().optional().catch(""),
	groupBy: z.enum(ISSUE_QUERY_GROUP_BY).optional().catch(undefined),
	/** Row density override; display-only, never part of a saved view. */
	density: z.enum(ISSUE_LIST_DENSITIES).optional().catch(undefined),
	/** Applied saved view; cleared as soon as the filter changes. */
	viewId: z.string().optional().catch(""),
	/**
	 * Show archived issues in the list (default off). URL values arrive as
	 * text, so `true`/`1` enable it; anything else falls back to the default.
	 */
	includeArchived: z
		.union([z.boolean(), z.literal(1), z.literal("1"), z.literal("true")])
		.transform((value) => value !== false)
		.optional()
		.catch(undefined),
	/**
	 * Set by the command palette to open the create-issue dialog on arrival.
	 * Accepts the URL forms (`new=true` / `new=1`) and programmatic booleans,
	 * always resolving to a boolean.
	 */
	new: z
		.union([z.boolean(), z.literal(1), z.literal("1"), z.literal("true")])
		.transform((value) => value !== false)
		.optional()
		.catch(undefined),
	view: z
		.enum(["list", "board", "kanban"])
		.transform((value) => (value === "kanban" ? "board" : value))
		.optional()
		.catch("list"),
});

export type IssuesSearch = z.infer<typeof issueSearchSchema>;
