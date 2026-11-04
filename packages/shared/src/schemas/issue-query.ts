import { z } from "zod";

/**
 * Structured issue query model.
 *
 * Filters are stored as a small tree of AND/OR groups with leaf conditions.
 * The tree is validated here (field/operator pairing, depth, condition count,
 * payload size) and compiled to SQL by the API — never concatenated as raw
 * strings.
 */

export const ISSUE_FILTER_FIELDS = [
	"statusId",
	"priority",
	"assigneeId",
	"createdById",
	"labelId",
	"projectId",
	"cycleId",
	"dueDate",
	"createdAt",
	"updatedAt",
	"estimate",
] as const;

export type IssueFilterField = (typeof ISSUE_FILTER_FIELDS)[number];

export const ISSUE_FILTER_OPERATORS = [
	"eq",
	"neq",
	"in",
	"notIn",
	"isNull",
	"isNotNull",
	"contains",
	"before",
	"after",
	"between",
	"gt",
	"lt",
	"gte",
	"lte",
] as const;

export type IssueFilterOperator = (typeof ISSUE_FILTER_OPERATORS)[number];

/** Text-like fields: ids (and the label link) support `contains`. */
export const ISSUE_FILTER_TEXT_FIELDS = [
	"statusId",
	"assigneeId",
	"createdById",
	"labelId",
	"projectId",
	"cycleId",
] as const satisfies readonly IssueFilterField[];

/** Numeric fields support range comparisons. */
export const ISSUE_FILTER_NUMBER_FIELDS = [
	"priority",
	"estimate",
] as const satisfies readonly IssueFilterField[];

/** Date fields compare against millisecond timestamps. */
export const ISSUE_FILTER_DATE_FIELDS = [
	"dueDate",
	"createdAt",
	"updatedAt",
] as const satisfies readonly IssueFilterField[];

const FIELD_OPERATORS: Record<
	IssueFilterField,
	readonly IssueFilterOperator[]
> = {
	statusId: ["eq", "neq", "in", "notIn", "isNull", "isNotNull", "contains"],
	priority: [
		"eq",
		"neq",
		"in",
		"notIn",
		"isNull",
		"isNotNull",
		"gt",
		"lt",
		"gte",
		"lte",
		"between",
	],
	assigneeId: ["eq", "neq", "in", "notIn", "isNull", "isNotNull", "contains"],
	createdById: ["eq", "neq", "in", "notIn", "isNull", "isNotNull", "contains"],
	labelId: ["eq", "neq", "in", "notIn", "isNull", "isNotNull", "contains"],
	projectId: ["eq", "neq", "in", "notIn", "isNull", "isNotNull", "contains"],
	cycleId: ["eq", "neq", "in", "notIn", "isNull", "isNotNull", "contains"],
	dueDate: [
		"eq",
		"neq",
		"before",
		"after",
		"between",
		"gt",
		"lt",
		"gte",
		"lte",
		"isNull",
		"isNotNull",
	],
	createdAt: [
		"eq",
		"neq",
		"before",
		"after",
		"between",
		"gt",
		"lt",
		"gte",
		"lte",
		"isNull",
		"isNotNull",
	],
	updatedAt: [
		"eq",
		"neq",
		"before",
		"after",
		"between",
		"gt",
		"lt",
		"gte",
		"lte",
		"isNull",
		"isNotNull",
	],
	estimate: [
		"eq",
		"neq",
		"in",
		"notIn",
		"isNull",
		"isNotNull",
		"gt",
		"lt",
		"gte",
		"lte",
		"between",
	],
};

export const ISSUE_FILTER_OPERATORS_BY_FIELD = FIELD_OPERATORS;

/** Conditions (leaf nodes) allowed in a single filter tree. */
export const ISSUE_FILTER_MAX_CONDITIONS = 20;

/** Maximum nesting depth of filter groups (the root group is depth 1). */
export const ISSUE_FILTER_MAX_DEPTH = 2;

/** Serialized filter size limit in bytes (JSON/UTF-8). */
export const ISSUE_FILTER_MAX_BYTES = 8 * 1024;

/** Maximum number of values in an `in`/`notIn` list. */
export const ISSUE_FILTER_MAX_LIST_LENGTH = 50;

/**
 * D1 allows at most 100 bound parameters per statement. The list query also
 * binds org/deleted scoping, pagination and the legacy flat filters, so the
 * filter tree gets a budget that leaves headroom: every scalar value in the
 * tree counts, and `in`/`notIn`/`between` arrays count per element.
 */
export const ISSUE_FILTER_MAX_BINDINGS = 80;

export type IssueFilterScalar = string | number;

export type IssueFilterValue = IssueFilterScalar | IssueFilterScalar[];

export type IssueFilterCondition = {
	type: "condition";
	field: IssueFilterField;
	operator: IssueFilterOperator;
	value?: IssueFilterValue;
};

export type IssueFilterGroup = {
	type: "group";
	op: "and" | "or";
	children: IssueFilterNode[];
};

export type IssueFilterNode = IssueFilterGroup | IssueFilterCondition;

const isTextField = (field: IssueFilterField): boolean =>
	(ISSUE_FILTER_TEXT_FIELDS as readonly string[]).includes(field);

const isNumberField = (field: IssueFilterField): boolean =>
	(ISSUE_FILTER_NUMBER_FIELDS as readonly string[]).includes(field);

const isDateField = (field: IssueFilterField): boolean =>
	(ISSUE_FILTER_DATE_FIELDS as readonly string[]).includes(field);

const isScalar = (value: unknown): value is IssueFilterScalar =>
	typeof value === "string" || typeof value === "number";

const DATE_VALUE = /^\d{4}-\d{2}-\d{2}/;

const parseDateValue = (value: IssueFilterScalar): number | null => {
	if (typeof value === "number") {
		return Number.isFinite(value) ? Math.trunc(value) : null;
	}
	if (!DATE_VALUE.test(value)) {
		return null;
	}
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
};

type ConditionIssue = {
	message: string;
};

const validateCondition = (node: IssueFilterCondition): ConditionIssue[] => {
	const issues: ConditionIssue[] = [];
	const operators = FIELD_OPERATORS[node.field];
	if (!operators?.includes(node.operator)) {
		return [
			{
				message: `Operator "${node.operator}" is not supported for field "${node.field}"`,
			},
		];
	}

	const { operator, value } = node;
	if (operator === "isNull" || operator === "isNotNull") {
		if (value !== undefined) {
			return [
				{
					message: `Operator "${operator}" on "${node.field}" does not accept a value`,
				},
			];
		}
		return issues;
	}

	if (operator === "in" || operator === "notIn" || operator === "between") {
		if (!Array.isArray(value)) {
			return [
				{
					message: `Operator "${operator}" on "${node.field}" requires an array value`,
				},
			];
		}
		if (operator === "between" && value.length !== 2) {
			return [
				{
					message: `Operator "between" on "${node.field}" requires exactly two values`,
				},
			];
		}
		const seen = new Set<string>();
		for (const item of value) {
			if (!isScalar(item)) {
				issues.push({
					message: `Operator "${operator}" on "${node.field}" only accepts string or number values`,
				});
				break;
			}
			if (isTextField(node.field) && !String(item).trim()) {
				issues.push({
					message: `Operator "${operator}" on "${node.field}" does not accept empty values`,
				});
				break;
			}
			if (isDateField(node.field) && parseDateValue(item) === null) {
				issues.push({
					message: `Operator "${operator}" on "${node.field}" requires ISO datetimes or millisecond timestamps`,
				});
				break;
			}
			if (isNumberField(node.field) && !Number.isFinite(item)) {
				issues.push({
					message: `Operator "${operator}" on "${node.field}" requires numeric values`,
				});
				break;
			}
			const key = String(item);
			if (seen.has(key)) {
				issues.push({
					message: `Operator "${operator}" on "${node.field}" contains duplicate values`,
				});
				break;
			}
			seen.add(key);
		}
		if (operator === "between" && !issues.length) {
			const [start, end] = value as IssueFilterScalar[];
			if (isDateField(node.field)) {
				const a = parseDateValue(start);
				const b = parseDateValue(end);
				if (a !== null && b !== null && a > b) {
					issues.push({
						message: `Operator "between" on "${node.field}" requires the first value to be before the second`,
					});
				}
			} else if (isNumberField(node.field)) {
				if (Number(start) > Number(end)) {
					issues.push({
						message: `Operator "between" on "${node.field}" requires the first value to be smaller`,
					});
				}
			}
		}
		return issues;
	}

	if (!isScalar(value)) {
		return [
			{
				message: `Operator "${operator}" on "${node.field}" requires a single string or number value`,
			},
		];
	}
	if (operator === "contains") {
		if (typeof value !== "string" || !value.trim()) {
			return [
				{
					message: `Operator "contains" on "${node.field}" requires a non-empty string`,
				},
			];
		}
		if (value.length > 200) {
			return [
				{
					message: `Operator "contains" on "${node.field}" accepts at most 200 characters`,
				},
			];
		}
		return issues;
	}
	if (isTextField(node.field)) {
		if (typeof value !== "string" || !value.trim()) {
			return [
				{
					message: `Field "${node.field}" requires a non-empty string value`,
				},
			];
		}
		return issues;
	}
	if (isDateField(node.field)) {
		if (parseDateValue(value) === null) {
			return [
				{
					message: `Field "${node.field}" requires an ISO datetime or millisecond timestamp`,
				},
			];
		}
		return issues;
	}
	// Numeric fields.
	if (!Number.isFinite(value)) {
		return [{ message: `Field "${node.field}" requires a numeric value` }];
	}
	return issues;
};

type FilterWalk = {
	conditions: number;
	maxDepth: number;
	bindings: number;
};

/** Scalar values the compiler will bind for one condition. */
const countConditionBindings = (node: IssueFilterCondition): number => {
	if (node.operator === "isNull" || node.operator === "isNotNull") {
		return 0;
	}
	return Array.isArray(node.value) ? node.value.length : 1;
};

const walkFilter = (
	node: IssueFilterNode,
	groupDepth: number,
	walk: FilterWalk,
	add: (message: string) => void,
) => {
	if (node.type === "group") {
		const depth = groupDepth + 1;
		walk.maxDepth = Math.max(walk.maxDepth, depth);
		if (node.children.length === 0) {
			add("Filter groups must contain at least one condition");
			return;
		}
		for (const child of node.children) {
			walkFilter(child, depth, walk, add);
		}
		return;
	}
	walk.conditions += 1;
	walk.bindings += countConditionBindings(node);
	for (const issue of validateCondition(node)) {
		add(issue.message);
	}
};

const validateFilterRoot = (node: IssueFilterNode): ConditionIssue[] => {
	const issues: ConditionIssue[] = [];
	const walk: FilterWalk = { conditions: 0, maxDepth: 0, bindings: 0 };
	walkFilter(node, 0, walk, (message) => issues.push({ message }));
	if (walk.maxDepth > ISSUE_FILTER_MAX_DEPTH) {
		issues.push({
			message: `Filter nesting is deeper than ${ISSUE_FILTER_MAX_DEPTH} levels`,
		});
	}
	if (walk.conditions > ISSUE_FILTER_MAX_CONDITIONS) {
		issues.push({
			message: `Filters support at most ${ISSUE_FILTER_MAX_CONDITIONS} conditions`,
		});
	}
	if (walk.bindings > ISSUE_FILTER_MAX_BINDINGS) {
		issues.push({
			message: `Filters bind at most ${ISSUE_FILTER_MAX_BINDINGS} values (in/notIn lists count per element)`,
		});
	}
	const bytes = new TextEncoder().encode(JSON.stringify(node)).length;
	if (bytes > ISSUE_FILTER_MAX_BYTES) {
		issues.push({
			message: `Filter payload exceeds the ${ISSUE_FILTER_MAX_BYTES} byte limit`,
		});
	}
	return issues;
};

/** Leaf/group schema without root-level limits (children reuse it). */
const issueFilterNodeBase: z.ZodType<IssueFilterNode> = z.lazy(() =>
	z.union([
		z.object({
			type: z.literal("condition"),
			field: z.enum(ISSUE_FILTER_FIELDS),
			operator: z.enum(ISSUE_FILTER_OPERATORS),
			value: z
				.union([
					z.string(),
					z.number(),
					z
						.array(z.union([z.string(), z.number()]))
						.max(ISSUE_FILTER_MAX_LIST_LENGTH),
				])
				.optional(),
		}),
		z.object({
			type: z.literal("group"),
			op: z.enum(["and", "or"]),
			children: z.array(issueFilterNodeBase).min(1).max(20),
		}),
	]),
);

/** Recursive filter tree with depth/condition/size limits enforced once. */
export const issueFilterNodeSchema = issueFilterNodeBase.superRefine(
	(node, ctx) => {
		for (const issue of validateFilterRoot(node)) {
			ctx.addIssue({ code: "custom", message: issue.message });
		}
	},
);

export const ISSUE_QUERY_SORT_FIELDS = [
	"updated",
	"created",
	"priority",
	"dueDate",
	"estimate",
	"status",
] as const;

export type IssueQuerySortField = (typeof ISSUE_QUERY_SORT_FIELDS)[number];

export const ISSUE_QUERY_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type IssueQuerySortDirection =
	(typeof ISSUE_QUERY_SORT_DIRECTIONS)[number];

export const issueQuerySortSchema = z.object({
	field: z.enum(ISSUE_QUERY_SORT_FIELDS),
	direction: z.enum(ISSUE_QUERY_SORT_DIRECTIONS).default("desc"),
});

export type IssueQuerySort = z.infer<typeof issueQuerySortSchema>;

export const ISSUE_QUERY_GROUP_BY = [
	"status",
	"assignee",
	"priority",
	"label",
] as const;

export type IssueQueryGroupBy = (typeof ISSUE_QUERY_GROUP_BY)[number];

export const ISSUE_QUERY_LAYOUTS = ["list", "board"] as const;

/** Maximum number of sort keys accepted for a single query. */
export const ISSUE_QUERY_MAX_SORTS = 3;

/**
 * Saved-view payload: the filter tree plus presentation options.
 *
 * - `groupBy` and `layout` are presentation hints: the API persists and echoes
 *   them so views round-trip unchanged, but the server does not group rows.
 *   The web client derives the groups from the returned list.
 * - `sort` is applied server-side (multi-key sort with a stable tie-breaker).
 */
export const issueQuerySchema = z.object({
	filter: issueFilterNodeSchema.optional(),
	sort: z.array(issueQuerySortSchema).max(ISSUE_QUERY_MAX_SORTS).optional(),
	groupBy: z.enum(ISSUE_QUERY_GROUP_BY).nullable().optional(),
	layout: z.enum(ISSUE_QUERY_LAYOUTS).optional(),
});

export type IssueQuery = z.infer<typeof issueQuerySchema>;

/** Legacy scalar sort values still accepted by the flat list endpoint. */
export const ISSUE_LEGACY_SORT_FIELDS = [
	"updated",
	"created",
	"priority",
] as const;
