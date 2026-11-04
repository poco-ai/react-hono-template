import {
	ISSUE_FILTER_MAX_LIST_LENGTH,
	type IssueFilterField,
	type IssueFilterNode,
	type IssueFilterOperator,
	type IssueFilterScalar,
	type IssueQuerySort,
} from "@workspace/shared";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { issueLabels, issueStatuses, issues } from "../db/schema";
import type { Database } from "../db/types";

/**
 * Whitelisted compiler: converts a validated `IssueFilterNode` into drizzle SQL.
 * Identifiers come from the schema objects below (never interpolation); values
 * are always bound parameters.
 */

const TEXT_FIELDS = new Set<IssueFilterField>([
	"statusId",
	"assigneeId",
	"createdById",
	"projectId",
]);

const NUMBER_FIELDS = new Set<IssueFilterField>(["priority", "estimate"]);

const DATE_FIELDS = new Set<IssueFilterField>([
	"dueDate",
	"createdAt",
	"updatedAt",
]);

const TEXT_COLUMNS: Partial<Record<IssueFilterField, AnySQLiteColumn>> = {
	statusId: issues.statusId,
	assigneeId: issues.assigneeId,
	createdById: issues.createdById,
	projectId: issues.projectId,
};

const NUMBER_COLUMNS: Partial<Record<IssueFilterField, AnySQLiteColumn>> = {
	priority: issues.priority,
	estimate: issues.estimate,
};

const DATE_COLUMNS: Partial<Record<IssueFilterField, AnySQLiteColumn>> = {
	dueDate: issues.dueDate,
	createdAt: issues.createdAt,
	updatedAt: issues.updatedAt,
};

/**
 * `contains` is compiled as `instr(lower(col), lower(?)) > 0` instead of a
 * `LIKE '%term%'` pattern: D1 rejects LIKE patterns longer than 50 bytes, which
 * long CJK search terms exceed. `instr` needs no escaping either, so `%` and
 * `_` match literally. The 200-character cap from the schema still applies.
 */
const contains = (column: AnySQLiteColumn, value: unknown): SQL =>
	sql`instr(lower(${column}), lower(${String(value)})) > 0`;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deduplicates list values (stable order) and caps the list length at 50. */
export const normalizeFilterList = (
	values: readonly IssueFilterScalar[],
): IssueFilterScalar[] => {
	const seen = new Set<string>();
	const result: IssueFilterScalar[] = [];
	for (const value of values) {
		const key = String(value);
		if (seen.has(key) || result.length >= ISSUE_FILTER_MAX_LIST_LENGTH) {
			continue;
		}
		seen.add(key);
		result.push(value);
	}
	return result;
};

const toMs = (value: IssueFilterScalar): number => {
	if (typeof value === "number") {
		return Math.trunc(value);
	}
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) {
		// Schema validation rejects this; the guard keeps the compiler total.
		throw new Error(`Invalid date filter value: ${value}`);
	}
	return parsed;
};

/**
 * Date-only values (`YYYY-MM-DD`) describe a whole UTC day, while full ISO
 * datetimes and millisecond timestamps stay exact. `start` is inclusive and
 * `end` is exclusive (the start of the next day) for date-only input.
 */
const dateBounds = (
	value: IssueFilterScalar,
): { start: number; end: number; dateOnly: boolean } => {
	if (typeof value === "string" && DATE_ONLY.test(value)) {
		const start = Date.parse(`${value}T00:00:00.000Z`);
		return { start, end: start + DAY_MS, dateOnly: true };
	}
	const ms = toMs(value);
	return { start: ms, end: ms, dateOnly: false };
};

const compileLabelCondition = (
	db: Database,
	operator: IssueFilterOperator,
	value: unknown,
): SQL | undefined => {
	const ids = (condition?: SQL) =>
		condition
			? db
					.select({ issueId: issueLabels.issueId })
					.from(issueLabels)
					.where(condition)
			: db.select({ issueId: issueLabels.issueId }).from(issueLabels);
	const inList = (list: IssueFilterScalar[]) =>
		inArray(
			issueLabels.labelId,
			list.map((item) => String(item)),
		);
	switch (operator) {
		case "isNull":
			return notInArray(issues.id, ids());
		case "isNotNull":
			return inArray(issues.id, ids());
		case "eq":
			return inArray(issues.id, ids(eq(issueLabels.labelId, String(value))));
		case "neq":
			return notInArray(issues.id, ids(eq(issueLabels.labelId, String(value))));
		case "in": {
			const list = normalizeFilterList(value as IssueFilterScalar[]);
			return list.length === 0 ? sql`0` : inArray(issues.id, ids(inList(list)));
		}
		case "notIn": {
			const list = normalizeFilterList(value as IssueFilterScalar[]);
			return list.length === 0
				? sql`1`
				: notInArray(issues.id, ids(inList(list)));
		}
		case "contains":
			return inArray(issues.id, ids(contains(issueLabels.labelId, value)));
		default:
			return undefined;
	}
};

const compileTextCondition = (
	column: AnySQLiteColumn,
	operator: IssueFilterOperator,
	value: unknown,
): SQL | undefined => {
	switch (operator) {
		case "eq":
			return eq(column, String(value));
		case "neq":
			return ne(column, String(value));
		case "in": {
			const list = normalizeFilterList(value as IssueFilterScalar[]);
			return list.length === 0
				? sql`0`
				: inArray(
						column,
						list.map((item) => String(item)),
					);
		}
		case "notIn": {
			const list = normalizeFilterList(value as IssueFilterScalar[]);
			return list.length === 0
				? sql`1`
				: notInArray(
						column,
						list.map((item) => String(item)),
					);
		}
		case "isNull":
			return isNull(column);
		case "isNotNull":
			return isNotNull(column);
		case "contains":
			return contains(column, value);
		default:
			return undefined;
	}
};

const compileNumberCondition = (
	column: AnySQLiteColumn,
	operator: IssueFilterOperator,
	value: unknown,
): SQL | undefined => {
	const list = Array.isArray(value) ? (value as IssueFilterScalar[]) : [];
	switch (operator) {
		case "eq":
			return eq(column, Number(value));
		case "neq":
			return ne(column, Number(value));
		case "in": {
			const normalized = normalizeFilterList(list);
			return normalized.length === 0
				? sql`0`
				: inArray(
						column,
						normalized.map((item) => Number(item)),
					);
		}
		case "notIn": {
			const normalized = normalizeFilterList(list);
			return normalized.length === 0
				? sql`1`
				: notInArray(
						column,
						normalized.map((item) => Number(item)),
					);
		}
		case "isNull":
			return isNull(column);
		case "isNotNull":
			return isNotNull(column);
		case "gt":
			return gt(column, Number(value));
		case "lt":
			return lt(column, Number(value));
		case "gte":
			return gte(column, Number(value));
		case "lte":
			return lte(column, Number(value));
		case "between":
			return and(
				gte(column, Number(list[0])),
				lte(column, Number(list[1])),
			) as SQL;
		default:
			return undefined;
	}
};

const compileDateCondition = (
	column: AnySQLiteColumn,
	operator: IssueFilterOperator,
	value: unknown,
): SQL | undefined => {
	const list = Array.isArray(value) ? (value as IssueFilterScalar[]) : [];
	switch (operator) {
		case "eq": {
			const bounds = dateBounds(value as IssueFilterScalar);
			return bounds.dateOnly
				? sql`(${column} >= ${bounds.start} and ${column} < ${bounds.end})`
				: sql`${column} = ${bounds.start}`;
		}
		case "neq": {
			const bounds = dateBounds(value as IssueFilterScalar);
			return bounds.dateOnly
				? sql`(${column} < ${bounds.start} or ${column} >= ${bounds.end})`
				: sql`${column} <> ${bounds.start}`;
		}
		case "before":
		case "lt":
			return sql`${column} < ${dateBounds(value as IssueFilterScalar).start}`;
		case "after":
		case "gt": {
			const bounds = dateBounds(value as IssueFilterScalar);
			return bounds.dateOnly
				? sql`${column} >= ${bounds.end}`
				: sql`${column} > ${bounds.start}`;
		}
		case "gte":
			return sql`${column} >= ${dateBounds(value as IssueFilterScalar).start}`;
		case "lte": {
			const bounds = dateBounds(value as IssueFilterScalar);
			return bounds.dateOnly
				? sql`${column} < ${bounds.end}`
				: sql`${column} <= ${bounds.start}`;
		}
		case "between": {
			const start = dateBounds(list[0]);
			const end = dateBounds(list[1]);
			return end.dateOnly
				? sql`(${column} >= ${start.start} and ${column} < ${end.end})`
				: sql`(${column} >= ${start.start} and ${column} <= ${end.start})`;
		}
		case "isNull":
			return isNull(column);
		case "isNotNull":
			return isNotNull(column);
		default:
			return undefined;
	}
};

const compileCondition = (
	db: Database,
	node: Extract<IssueFilterNode, { type: "condition" }>,
): SQL | undefined => {
	const { field, operator, value } = node;
	if (field === "labelId") {
		return compileLabelCondition(db, operator, value);
	}
	if (DATE_FIELDS.has(field)) {
		const column = DATE_COLUMNS[field];
		return column ? compileDateCondition(column, operator, value) : undefined;
	}
	if (NUMBER_FIELDS.has(field)) {
		const column = NUMBER_COLUMNS[field];
		return column ? compileNumberCondition(column, operator, value) : undefined;
	}
	if (TEXT_FIELDS.has(field)) {
		const column = TEXT_COLUMNS[field];
		return column ? compileTextCondition(column, operator, value) : undefined;
	}
	return undefined;
};

/** Compiles a validated filter tree; groups with no usable leaf return undefined. */
export const compileIssueFilter = (
	db: Database,
	node: IssueFilterNode,
): SQL | undefined => {
	if (node.type === "condition") {
		return compileCondition(db, node);
	}
	const children = node.children
		.map((child) => compileIssueFilter(db, child))
		.filter((condition): condition is SQL => condition !== undefined);
	if (children.length === 0) {
		return undefined;
	}
	if (children.length === 1) {
		return children[0];
	}
	return node.op === "or" ? or(...children) : and(...children);
};

/**
 * ORDER BY for the supported sort fields. Status sorts by the workflow
 * position through a correlated lookup so the list query stays join-free
 * (and therefore safe inside D1 batches). Ascending sorts on nullable
 * numeric/date columns push NULLs last, and every ordering ends with stable
 * tie-breakers so paginated reads cannot repeat or skip rows.
 */
export const issueSortOrderBy = (sorts: IssueQuerySort[]): SQL[] => {
	const keys: SQL[] = [];
	for (const sort of sorts) {
		const direction = sort.direction === "asc" ? asc : desc;
		switch (sort.field) {
			case "created":
				keys.push(direction(issues.createdAt));
				break;
			case "priority":
				keys.push(direction(issues.priority));
				break;
			case "dueDate": {
				if (sort.direction === "asc") {
					keys.push(sql`case when ${issues.dueDate} is null then 1 else 0 end`);
				}
				keys.push(direction(issues.dueDate));
				break;
			}
			case "estimate": {
				if (sort.direction === "asc") {
					keys.push(
						sql`case when ${issues.estimate} is null then 1 else 0 end`,
					);
				}
				keys.push(direction(issues.estimate));
				break;
			}
			case "status":
				keys.push(
					direction(sql`(
						select ${issueStatuses.position}
						from ${issueStatuses}
						where ${issueStatuses.id} = ${issues.statusId}
					)`),
				);
				break;
			default:
				keys.push(direction(issues.updatedAt));
				break;
		}
	}
	// Stable tie-breakers; skip `updatedAt` when it already leads the sort.
	if (!sorts.some((sort) => sort.field === "updated")) {
		keys.push(desc(issues.updatedAt));
	}
	keys.push(asc(issues.id));
	return keys;
};
