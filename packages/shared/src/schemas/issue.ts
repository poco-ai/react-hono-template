import { z } from "zod";
import { ISSUE_PRIORITY, ISSUE_STATUSES } from "../constants";
import { parseCsv } from "../csv";
import {
	ISSUE_LEGACY_SORT_FIELDS,
	ISSUE_QUERY_GROUP_BY,
	type IssueQuerySort,
	issueFilterNodeSchema,
	issueQuerySortSchema,
} from "./issue-query";
import { paginationQueryShape } from "./pagination";

const toArray = (value: unknown) => {
	if (typeof value === "string") {
		return parseCsv(value);
	}
	return value;
};

const toNumberArray = (value: unknown) => {
	const array = toArray(value);
	if (Array.isArray(array)) {
		return array.map((item) => Number(item));
	}
	return array;
};

/**
 * Query strings carry the structured filter as JSON. Invalid JSON is passed
 * through unchanged so the filter schema reports the actual validation error.
 */
const parseFilterQuery = (value: unknown) => {
	if (typeof value !== "string") {
		return value;
	}
	if (!value.trim()) {
		return undefined;
	}
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

/**
 * `sort` accepts the legacy scalar (`updated`/`created`/`priority`) or a JSON
 * array of `{ field, direction }` entries for multi-key sorting.
 */
const parseSortQuery = (value: unknown) => {
	if (typeof value !== "string") {
		return value;
	}
	const trimmed = value.trim();
	if (!trimmed.startsWith("[")) {
		return trimmed;
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		return trimmed;
	}
};

export const createIssueSchema = z.object({
	title: z.string().trim().min(1).max(500),
	description: z.string().max(20000).optional(),
	/** Organization status id; preferred over the legacy `status` name. */
	statusId: z
		.string()
		.min(1)
		.describe("Organization workflow status id (preferred).")
		.optional(),
	/**
	 * @deprecated Compatibility input: legacy status name. The service resolves
	 * it to an organization status id.
	 */
	status: z
		.enum(ISSUE_STATUSES)
		.describe("Deprecated legacy status name; resolved to a status id.")
		.optional(),
	priority: z
		.number()
		.int()
		.min(ISSUE_PRIORITY.none)
		.max(ISSUE_PRIORITY.low)
		.optional(),
	assigneeId: z.string().min(1).optional(),
	labelIds: z.array(z.string().min(1)).max(20).optional(),
	dueDate: z.iso.datetime().optional(),
	estimate: z.number().int().min(0).max(100).optional(),
	/** Parent issue id; the parent must live in the same project. */
	parentId: z.string().min(1).optional(),
	/** Planning cycle id; must belong to the same organization and project. */
	cycleId: z.string().min(1).optional(),
});

export const updateIssueSchema = createIssueSchema.partial().extend({
	description: z.string().max(20000).nullish(),
	priority: z.number().int().min(0).max(4).nullish(),
	assigneeId: z.string().min(1).nullish(),
	dueDate: z.iso.datetime().nullish(),
	estimate: z.number().int().min(0).max(100).nullish(),
	/** Pass null to detach the issue from its parent. */
	parentId: z.string().min(1).nullish(),
	/** Pass null to remove the issue from its cycle. */
	cycleId: z.string().min(1).nullish(),
});

export const issueListQuerySchema = z.object({
	...paginationQueryShape(20),
	/**
	 * @deprecated Legacy status names (e.g. `in_progress`). Mapped to the
	 * organization's status ids by the service.
	 */
	status: z
		.preprocess(toArray, z.array(z.enum(ISSUE_STATUSES)).optional())
		.describe("Deprecated legacy status names (comma separated)."),
	/** Organization status ids. Preferred over `status`. */
	statusId: z
		.preprocess(toArray, z.array(z.string().min(1)).optional())
		.describe("Organization workflow status ids (comma separated)."),
	priority: z.preprocess(
		toNumberArray,
		z
			.array(
				z.coerce
					.number()
					.int()
					.min(ISSUE_PRIORITY.none)
					.max(ISSUE_PRIORITY.low),
			)
			.optional(),
	),
	assigneeId: z.string().min(1).optional(),
	labelId: z.string().min(1).optional(),
	search: z.string().trim().max(100).optional(),
	/**
	 * Legacy single sort, or a JSON array of `{ field, direction }` entries
	 * (see `issueQuerySortSchema`). The service normalizes both forms.
	 */
	sort: z
		.preprocess(
			parseSortQuery,
			z
				.union([
					z.enum(ISSUE_LEGACY_SORT_FIELDS),
					z.array(issueQuerySortSchema).max(3),
				])
				.default("updated"),
		)
		.describe(
			"updated|created|priority, or a JSON array of {field,direction} sort keys.",
		),
	projectId: z.string().min(1).optional(),
	/** Planning cycle id; the web client resolves `current` to a cycle id. */
	cycleId: z.string().min(1).optional(),
	/** Structured filter tree (JSON string). Combines with the flat params via AND. */
	filter: z
		.preprocess(parseFilterQuery, issueFilterNodeSchema.optional())
		.describe("Structured filter tree as JSON."),
	/**
	 * Presentation-only grouping hint. It is accepted for parity with saved
	 * views but the API does not group rows; the web client derives groups.
	 */
	groupBy: z.enum(ISSUE_QUERY_GROUP_BY).optional(),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export type IssueListQuery = z.infer<typeof issueListQuerySchema>;

/** Normalizes the legacy scalar sort and the array form to a sort list. */
export const normalizeIssueSorts = (
	sort: IssueListQuery["sort"] | IssueQuerySort[] | undefined,
): IssueQuerySort[] => {
	if (Array.isArray(sort)) {
		return sort;
	}
	if (sort === "created") {
		return [{ field: "created", direction: "desc" }];
	}
	if (sort === "priority") {
		return [
			{ field: "priority", direction: "asc" },
			{ field: "created", direction: "desc" },
		];
	}
	return [{ field: "updated", direction: "desc" }];
};
