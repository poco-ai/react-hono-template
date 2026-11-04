import type { StatusDto } from "@api/dto/status.dto";
import {
	ISSUE_FILTER_OPERATORS_BY_FIELD,
	ISSUE_PRIORITIES,
	ISSUE_QUERY_GROUP_BY,
	ISSUE_QUERY_SORT_FIELDS,
	type IssueFilterCondition,
	type IssueFilterField,
	type IssueFilterGroup,
	type IssueFilterNode,
	type IssueFilterOperator,
	type IssueFilterScalar,
	type IssueQuery,
	type IssueQueryGroupBy,
	type IssueQuerySort,
	type IssueQuerySortDirection,
	type IssueQuerySortField,
	issueFilterNodeSchema,
	issueQuerySchema,
	issueQuerySortSchema,
	normalizeStatusNameKey,
	parseCsv,
	priorityName,
} from "@workspace/shared";
import type { IssuesSearch } from "./search";

/**
 * Normalizes URL search params and saved-view queries into the request shape
 * understood by `GET /issues`: one structured filter tree, a sort list and an
 * optional grouping hint. Legacy flat params (`status`, `priority`,
 * `assigneeId`, `labelId`) are converted into equivalent filter conditions so
 * every request has a single source of truth.
 */

export interface IssueSearchLike {
	statusId?: string;
	status?: string;
	priority?: string;
	assigneeId?: string;
	labelId?: string;
	search?: string;
	sort?: string;
	filter?: string;
	groupBy?: string;
	viewId?: string;
	cycleId?: string;
}

export interface IssueQueryState {
	filter?: IssueFilterGroup;
	sorts: IssueQuerySort[];
	groupBy?: IssueQueryGroupBy;
	search: string;
	/** Flat cycle filter; never merged into `filter`. */
	cycleId?: string;
}

export const DEFAULT_ISSUE_SORT: IssueQuerySort = {
	field: "updated",
	direction: "desc",
};

/** Default direction for each sortable field when the UI offers a single key. */
export const ISSUE_SORT_DIRECTIONS: Record<
	IssueQuerySortField,
	IssueQuerySortDirection
> = {
	updated: "desc",
	created: "desc",
	priority: "asc",
	dueDate: "asc",
	estimate: "asc",
	status: "asc",
};

export const sortsForField = (field: IssueQuerySortField): IssueQuerySort[] => {
	if (field === "priority") {
		return [
			{ field: "priority", direction: "asc" },
			{ field: "created", direction: "desc" },
		];
	}
	return [{ field, direction: ISSUE_SORT_DIRECTIONS[field] }];
};

/** Primary sort field shown by the single-key sort picker. */
export const primarySortField = (
	sorts: IssueQuerySort[] | undefined,
): IssueQuerySortField => {
	const field = sorts?.[0]?.field;
	return field && (ISSUE_QUERY_SORT_FIELDS as readonly string[]).includes(field)
		? field
		: "updated";
};

const isSortField = (value: string): value is IssueQuerySortField =>
	(ISSUE_QUERY_SORT_FIELDS as readonly string[]).includes(value);

const normalizeSorts = (value: unknown): IssueQuerySort[] => {
	if (!Array.isArray(value)) {
		return [DEFAULT_ISSUE_SORT];
	}
	const sorts: IssueQuerySort[] = [];
	for (const entry of value) {
		const parsed = issueQuerySortSchema.safeParse(entry);
		if (parsed.success) {
			sorts.push(parsed.data);
		}
	}
	return sorts.length > 0 ? sorts.slice(0, 3) : [DEFAULT_ISSUE_SORT];
};

/** Parses the URL sort param (legacy scalar or JSON array). Never throws. */
export const parseSortParam = (value: string | undefined): IssueQuerySort[] => {
	if (!value) {
		return [DEFAULT_ISSUE_SORT];
	}
	const trimmed = value.trim();
	if (trimmed.startsWith("[")) {
		try {
			return normalizeSorts(JSON.parse(trimmed));
		} catch {
			return [DEFAULT_ISSUE_SORT];
		}
	}
	return isSortField(trimmed) ? sortsForField(trimmed) : [DEFAULT_ISSUE_SORT];
};

/** Rebuilds nodes in a fixed key order so equal filters hash identically. */
export const normalizeFilterTree = (node: IssueFilterNode): IssueFilterNode =>
	node.type === "group"
		? {
				type: "group",
				op: node.op,
				children: node.children.map(normalizeFilterTree),
			}
		: {
				type: "condition",
				field: node.field,
				operator: node.operator,
				...(node.value === undefined ? {} : { value: node.value }),
			};

/**
 * Best-effort filter parsing for URL/view data. Invalid JSON or invalid trees
 * return `undefined` so callers fall back to legacy/default filters instead of
 * surfacing a validation error.
 */
export const parseIssueFilter = (
	value: unknown,
): IssueFilterGroup | undefined => {
	let candidate = value;
	if (typeof value === "string") {
		if (!value.trim()) {
			return undefined;
		}
		try {
			candidate = JSON.parse(value);
		} catch {
			return undefined;
		}
	}
	if (!candidate || typeof candidate !== "object") {
		return undefined;
	}
	const node = candidate as IssueFilterNode;
	if (node.type !== "group" && node.type !== "condition") {
		return undefined;
	}
	const parsed = issueFilterNodeSchema.safeParse(node);
	if (!parsed.success) {
		return undefined;
	}
	const normalized = normalizeFilterTree(parsed.data);
	if (normalized.type === "condition") {
		return { type: "group", op: "and", children: [normalized] };
	}
	return normalized;
};

/** Serializes a non-empty, valid filter tree to the API's JSON param. */
export const serializeIssueFilter = (
	filter: IssueFilterGroup | undefined,
): string | undefined => {
	if (!filter || filter.children.length === 0) {
		return undefined;
	}
	if (!issueFilterNodeSchema.safeParse(filter).success) {
		return undefined;
	}
	return JSON.stringify(normalizeFilterTree(filter));
};

export const emptyFilter = (): IssueFilterGroup => ({
	type: "group",
	op: "and",
	children: [],
});

const statusIdFromName = (
	statuses: Pick<StatusDto, "id" | "name">[] | undefined,
	name: string,
) => {
	const key = normalizeStatusNameKey(name);
	return statuses?.find((status) => normalizeStatusNameKey(status.name) === key)
		?.id;
};

const assigneeCondition = (
	assigneeId: string | undefined,
): IssueFilterCondition | undefined => {
	if (!assigneeId) {
		return undefined;
	}
	if (assigneeId === "none") {
		return { type: "condition", field: "assigneeId", operator: "isNull" };
	}
	return {
		type: "condition",
		field: "assigneeId",
		operator: "eq",
		value: assigneeId,
	};
};

/**
 * Converts the pre-S3 flat URL params into an equivalent filter tree. Status
 * names are resolved against the organization's statuses; unresolved names are
 * skipped until that data loads.
 */
export const legacyFilterFromSearch = (
	search: IssueSearchLike,
	statuses?: Pick<StatusDto, "id" | "name">[],
): IssueFilterGroup | undefined => {
	const children: IssueFilterCondition[] = [];

	const statusIds = [
		...new Set([
			...parseCsv(search.statusId),
			...parseCsv(search.status)
				.map((name) => statusIdFromName(statuses, name))
				.filter((id): id is string => Boolean(id)),
		]),
	];
	if (statusIds.length > 0) {
		children.push({
			type: "condition",
			field: "statusId",
			operator: statusIds.length > 1 ? "in" : "eq",
			value: statusIds.length > 1 ? statusIds : statusIds[0],
		});
	}

	const priorities = [
		...new Set(
			parseCsv(search.priority)
				.map((name) => ISSUE_PRIORITIES.find((entry) => entry.name === name))
				.filter((entry): entry is (typeof ISSUE_PRIORITIES)[number] =>
					Boolean(entry),
				)
				.map((entry) => entry.value),
		),
	];
	if (priorities.length > 0) {
		children.push({
			type: "condition",
			field: "priority",
			operator: priorities.length > 1 ? "in" : "eq",
			value: priorities.length > 1 ? priorities : priorities[0],
		});
	}

	const assignee = assigneeCondition(search.assigneeId);
	if (assignee) {
		children.push(assignee);
	}
	if (search.labelId) {
		children.push({
			type: "condition",
			field: "labelId",
			operator: "eq",
			value: search.labelId,
		});
	}

	return children.length > 0
		? { type: "group", op: "and", children }
		: undefined;
};

/**
 * Resolves the effective issue query. Precedence: explicit URL filter, then
 * the applied view's query, then legacy flat params, finally defaults.
 *
 * Saved-view queries are persisted JSON, so they are validated defensively:
 * corrupt data (bad filter tree, unknown sort/grouping) falls back to the URL
 * or defaults instead of reaching the list/grouping code.
 */
export const resolveIssueQuery = (
	search: IssueSearchLike,
	{
		view,
		statuses,
	}: {
		view?: IssueQuery;
		statuses?: Pick<StatusDto, "id" | "name">[];
	} = {},
): IssueQueryState => {
	const parsedView = view ? issueQuerySchema.safeParse(view) : undefined;
	const viewQuery = parsedView?.success ? parsedView.data : undefined;
	const urlFilter = parseIssueFilter(search.filter);
	const viewFilter = viewQuery?.filter
		? parseIssueFilter(viewQuery.filter)
		: undefined;
	const filter =
		urlFilter ?? viewFilter ?? legacyFilterFromSearch(search, statuses);
	const sorts = viewQuery?.sort?.length
		? normalizeSorts(viewQuery.sort)
		: parseSortParam(search.sort);
	const viewGroupBy =
		viewQuery?.groupBy &&
		(ISSUE_QUERY_GROUP_BY as readonly string[]).includes(viewQuery.groupBy)
			? (viewQuery.groupBy as IssueQueryGroupBy)
			: undefined;
	const urlGroupBy = (ISSUE_QUERY_GROUP_BY as readonly string[]).includes(
		search.groupBy ?? "",
	)
		? (search.groupBy as IssueQueryGroupBy)
		: undefined;
	return {
		filter,
		sorts,
		groupBy: viewQuery ? viewGroupBy : urlGroupBy,
		search: (search.search ?? "").trim(),
		cycleId: (search.cycleId ?? "").trim() || undefined,
	};
};

/**
 * Position-based React keys for filter nodes. Keys must not depend on node
 * content: deriving them from the value remounts the edited input and loses
 * focus. `parentPath` keeps equally-indexed nodes in nested groups distinct.
 */
export const filterNodeKeys = (
	nodes: readonly IssueFilterNode[],
	parentPath: readonly number[] = [],
): string[] => nodes.map((_, index) => [...parentPath, index].join("."));

/**
 * URL patch for changing the filter. While a saved view is applied, its sort
 * and grouping are materialized so the new filter keeps them after `viewId`
 * is dropped; without a view the URL keeps the user's own sort/grouping
 * choices. Callers mark the view dirty exactly when `view` is provided.
 */
export const detachedFilterSearch = ({
	view,
	resolved,
	filter,
	search,
	overrides = {},
}: {
	view?: IssueQuery;
	resolved: IssueQueryState;
	filter?: IssueFilterGroup;
	search?: string;
	overrides?: Partial<Pick<IssuesSearch, "sort" | "groupBy" | "page">>;
}): Partial<IssuesSearch> => ({
	filter: serializeIssueFilter(filter) ?? "",
	...(view
		? { sort: JSON.stringify(resolved.sorts), groupBy: resolved.groupBy }
		: {}),
	...overrides,
	statusId: "",
	status: "",
	priority: "",
	assigneeId: "",
	labelId: "",
	...(search === undefined ? {} : { search }),
	viewId: undefined,
	page: overrides.page ?? 1,
});

/** Request params for the issue list endpoint. */
export const buildIssueListParams = ({
	filter,
	sorts,
	groupBy,
	search,
	page,
	pageSize,
	cycleId,
}: IssueQueryState & { page: number; pageSize: number }) => ({
	page: String(page),
	pageSize: String(pageSize),
	search: search || undefined,
	filter: serializeIssueFilter(filter),
	sort: JSON.stringify(sorts.length > 0 ? sorts : [DEFAULT_ISSUE_SORT]),
	groupBy,
	cycleId,
});

/** Canonical cache-key fragment covering the complete query. */
export const issueQueryKey = ({
	filter,
	sorts,
	groupBy,
	search,
	cycleId,
}: IssueQueryState) => ({
	filter:
		filter && filter.children.length > 0 ? normalizeFilterTree(filter) : null,
	sort: sorts.length > 0 ? sorts : [DEFAULT_ISSUE_SORT],
	groupBy: groupBy ?? null,
	search: search ?? "",
	cycleId: cycleId ?? null,
});

export const isNullOperator = (operator: IssueFilterOperator): boolean =>
	operator === "isNull" || operator === "isNotNull";

export const isListOperator = (operator: IssueFilterOperator): boolean =>
	operator === "in" || operator === "notIn";

export const isRangeOperator = (operator: IssueFilterOperator): boolean =>
	operator === "between";

export const operatorsForField = (
	field: IssueFilterField,
): readonly IssueFilterOperator[] => ISSUE_FILTER_OPERATORS_BY_FIELD[field];

export const filterConditionCount = (
	node: IssueFilterNode | undefined,
): number =>
	!node
		? 0
		: node.type === "condition"
			? 1
			: node.children.reduce(
					(total, child) => total + filterConditionCount(child),
					0,
				);

/** Root children rendered as removable chips. */
export const filterChips = (filter: IssueFilterGroup | undefined) =>
	filter?.children ?? [];

/** Collects the scalar selections of a field (eq/in conditions only). */
export const filterSelection = (
	filter: IssueFilterGroup | undefined,
	field: IssueFilterField,
): string[] => {
	const values: string[] = [];
	const visit = (node: IssueFilterNode) => {
		if (node.type === "group") {
			for (const child of node.children) {
				visit(child);
			}
			return;
		}
		if (node.field !== field || node.value === undefined) {
			return;
		}
		if (node.operator === "eq") {
			values.push(String(node.value));
		} else if (node.operator === "in" && Array.isArray(node.value)) {
			for (const value of node.value) {
				values.push(String(value));
			}
		}
	};
	if (filter) {
		visit(filter);
	}
	return [...new Set(values)];
};

/** Explicit unassigned selection (`none`) or the first equality value. */
export const assigneeSelection = (
	filter: IssueFilterGroup | undefined,
): string | undefined => {
	let selected: string | undefined;
	const visit = (node: IssueFilterNode) => {
		if (node.type === "group") {
			for (const child of node.children) {
				visit(child);
			}
			return;
		}
		if (node.field !== "assigneeId" || selected !== undefined) {
			return;
		}
		if (node.operator === "isNull") {
			selected = "none";
		} else if (node.operator === "eq" && node.value !== undefined) {
			selected = String(node.value);
		}
	};
	if (filter) {
		visit(filter);
	}
	return selected;
};

const stripField = (
	node: IssueFilterNode,
	field: IssueFilterField,
): IssueFilterNode | undefined => {
	if (node.type === "condition") {
		return node.field === field ? undefined : node;
	}
	const children = node.children
		.map((child) => stripField(child, field))
		.filter((child): child is IssueFilterNode => child !== undefined);
	return children.length > 0 ? { ...node, children } : undefined;
};

/** Replaces every condition for a field with the supplied conditions. */
export const setFieldFilter = (
	filter: IssueFilterGroup | undefined,
	field: IssueFilterField,
	conditions: IssueFilterCondition[],
): IssueFilterGroup => {
	const root = filter ?? emptyFilter();
	const stripped = stripField(root, field);
	const base: IssueFilterGroup =
		stripped?.type === "group" ? stripped : emptyFilter();
	if (conditions.length === 0) {
		return base;
	}
	return { ...base, children: [...base.children, ...conditions] };
};

/** Replaces a node addressed by a child-index path from the root group. */
export const replaceFilterNode = (
	root: IssueFilterGroup,
	path: number[],
	node: IssueFilterNode,
): IssueFilterGroup => {
	if (path.length === 0) {
		return node.type === "group" ? node : { ...root, children: [node] };
	}
	const [index, ...rest] = path;
	return {
		...root,
		children: root.children.map((child, position) => {
			if (position !== index) {
				return child;
			}
			if (rest.length === 0) {
				return node;
			}
			return child.type === "group"
				? replaceFilterNode(child, rest, node)
				: child;
		}),
	};
};

/** Removes a node by path; empty groups are pruned. */
export const removeFilterNode = (
	root: IssueFilterGroup,
	path: number[],
): IssueFilterGroup => {
	if (path.length === 0) {
		return emptyFilter();
	}
	const [index, ...rest] = path;
	const children = root.children.flatMap((child, position) => {
		if (position !== index) {
			return [child];
		}
		if (rest.length === 0) {
			return [];
		}
		if (child.type !== "group") {
			return [child];
		}
		const next = removeFilterNode(child, rest);
		return next.children.length > 0 ? [next] : [];
	});
	return { ...root, children };
};

/** Adds a root-level condition (used by quick filters and the builder). */
export const addFilterCondition = (
	root: IssueFilterGroup,
	condition: IssueFilterCondition,
): IssueFilterGroup => ({ ...root, children: [...root.children, condition] });

/** Human-friendly value scalars for labels/selects. */
export const filterScalarLabel = (
	field: IssueFilterField,
	value: IssueFilterScalar,
): string => {
	if (field === "priority") {
		return priorityName(Number(value));
	}
	return String(value);
};

/** Priority values listed by the quick filter. */
export const PRIORITY_VALUES = ISSUE_PRIORITIES.map((entry) => entry.value);
