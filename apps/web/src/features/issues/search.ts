import {
	ISSUE_QUERY_GROUP_BY,
	ISSUE_QUERY_SORT_FIELDS,
	issueQuerySortSchema,
} from "@workspace/shared";
import { z } from "zod";
import { ISSUE_LIST_DENSITIES } from "./list-preferences";

/**
 * `sort` carries either the legacy single key or the JSON array produced when
 * a saved view is detached from the URL. Invalid values fall back to `updated`.
 */
const sortParam = z
	.string()
	.transform((value) => {
		const trimmed = value.trim();
		if ((ISSUE_QUERY_SORT_FIELDS as readonly string[]).includes(trimmed)) {
			return trimmed;
		}
		if (trimmed.startsWith("[")) {
			try {
				const parsed = JSON.parse(trimmed);
				if (
					Array.isArray(parsed) &&
					parsed.length > 0 &&
					parsed.every((entry) => issueQuerySortSchema.safeParse(entry).success)
				) {
					return trimmed;
				}
			} catch {
				return "updated";
			}
		}
		return "updated";
	})
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
