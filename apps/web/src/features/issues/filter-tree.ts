import type { ProjectDto } from "@api/dto/project.dto";
import type { StatusDto } from "@api/dto/status.dto";
import {
	ISSUE_FILTER_OPERATORS_BY_FIELD,
	ISSUE_PRIORITIES,
	type IssueFilterCondition,
	type IssueFilterField,
	type IssueFilterGroup,
	type IssueFilterNode,
	type IssueFilterOperator,
	type IssueFilterScalar,
} from "@workspace/shared";
import { todayDateOnly } from "@/lib/date";
import type { TranslationKey } from "@/lib/errors";

/**
 * Pure filter-tree primitives shared by the structured builder, the applied
 * chips and the URL/request helpers. No React: everything here is a plain
 * function or constant so it stays testable outside components.
 */

export type MemberOption = { userId: string; user: { name: string } };
export type LabelOption = { id: string; name: string };
export type ProjectOption = Pick<ProjectDto, "id" | "name" | "key">;
export type CycleOption = { id: string; name: string };

export type FilterValueSources = {
	statuses: StatusDto[];
	members: MemberOption[];
	labels: LabelOption[];
	projects: ProjectOption[];
	cycles: CycleOption[];
};

export const FIELD_LABEL_KEYS: Record<IssueFilterField, TranslationKey> = {
	statusId: "issues.filterFields.statusId",
	priority: "issues.filterFields.priority",
	assigneeId: "issues.filterFields.assigneeId",
	createdById: "issues.filterFields.createdById",
	labelId: "issues.filterFields.labelId",
	projectId: "issues.filterFields.projectId",
	cycleId: "issues.filterFields.cycleId",
	dueDate: "issues.filterFields.dueDate",
	createdAt: "issues.filterFields.createdAt",
	updatedAt: "issues.filterFields.updatedAt",
	estimate: "issues.filterFields.estimate",
};

export const OPERATOR_LABEL_KEYS: Record<IssueFilterOperator, TranslationKey> =
	{
		eq: "issues.filterOperators.eq",
		neq: "issues.filterOperators.neq",
		in: "issues.filterOperators.in",
		notIn: "issues.filterOperators.notIn",
		isNull: "issues.filterOperators.isNull",
		isNotNull: "issues.filterOperators.isNotNull",
		contains: "issues.filterOperators.contains",
		before: "issues.filterOperators.before",
		after: "issues.filterOperators.after",
		between: "issues.filterOperators.between",
		gt: "issues.filterOperators.gt",
		lt: "issues.filterOperators.lt",
		gte: "issues.filterOperators.gte",
		lte: "issues.filterOperators.lte",
	};

export const emptyFilter = (): IssueFilterGroup => ({
	type: "group",
	op: "and",
	children: [],
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

export const isDateField = (field: IssueFilterField) =>
	field === "dueDate" || field === "createdAt" || field === "updatedAt";

export const isNumericField = (field: IssueFilterField) =>
	field === "priority" || field === "estimate";

export const isMemberField = (field: IssueFilterField) =>
	field === "assigneeId" || field === "createdById";

export const toScalar = (
	field: IssueFilterField,
	raw: string,
): IssueFilterScalar => (isNumericField(field) ? Number(raw) : raw);

export const listOptions = (
	field: IssueFilterField,
	{ statuses, members, labels, projects, cycles }: FilterValueSources,
) => {
	if (field === "statusId") {
		return statuses.map((status) => ({ value: status.id, label: status.name }));
	}
	if (field === "priority") {
		return ISSUE_PRIORITIES.map((priority) => ({
			value: String(priority.value),
			label: priority.name,
		}));
	}
	if (isMemberField(field)) {
		return members.map((member) => ({
			value: member.userId,
			label: member.user.name,
		}));
	}
	if (field === "labelId") {
		return labels.map((label) => ({ value: label.id, label: label.name }));
	}
	if (field === "cycleId") {
		return cycles.map((cycle) => ({ value: cycle.id, label: cycle.name }));
	}
	return projects.map((project) => ({
		value: project.id,
		label: `${project.key} · ${project.name}`,
	}));
};

/** Builds a valid condition with a sensible default value for the field. */
export const defaultConditionFor = (
	field: IssueFilterField,
	sources: FilterValueSources,
): IssueFilterCondition => {
	const operators = operatorsForField(field);
	const options = listOptions(field, sources);
	if (operators.includes("eq") && options.length > 0) {
		return {
			type: "condition",
			field,
			operator: "eq",
			value: toScalar(field, options[0].value),
		};
	}
	if (isDateField(field)) {
		return {
			type: "condition",
			field,
			operator: "before",
			value: todayDateOnly(),
		};
	}
	if (field === "priority") {
		return {
			type: "condition",
			field,
			operator: "eq",
			value: ISSUE_PRIORITIES[3].value,
		};
	}
	if (operators.includes("isNull")) {
		return { type: "condition", field, operator: "isNull" };
	}
	return {
		type: "condition",
		field,
		operator: "isNotNull",
	};
};

/** Resets operator/value when the field or operator changes. */
export const resetCondition = (
	condition: IssueFilterCondition,
	changes: {
		field?: IssueFilterField;
		operator?: IssueFilterOperator;
	},
	sources: FilterValueSources,
): IssueFilterCondition => {
	const field = changes.field ?? condition.field;
	const operatorChanged = changes.operator !== undefined;
	const fieldChanged = changes.field !== undefined;
	const base = fieldChanged ? defaultConditionFor(field, sources) : condition;
	const operator = changes.operator ?? base.operator;
	if (!operatorChanged && !fieldChanged) {
		return base;
	}
	if (fieldChanged && !operatorChanged) {
		return base;
	}
	const valueSource = fieldChanged ? base : condition;
	if (isNullOperator(operator)) {
		return { type: "condition", field, operator };
	}
	const options = listOptions(field, sources);
	const fallback = options[0]?.value;
	if (isListOperator(operator)) {
		const current = Array.isArray(valueSource.value)
			? valueSource.value
			: valueSource.value === undefined
				? []
				: [valueSource.value];
		const value = current.length
			? current
			: fallback !== undefined
				? [toScalar(field, fallback)]
				: [];
		return { type: "condition", field, operator, value };
	}
	if (isRangeOperator(operator)) {
		const date = todayDateOnly();
		return {
			type: "condition",
			field,
			operator,
			value: isDateField(field) ? [date, date] : [0, 10],
		};
	}
	if (operator === "contains") {
		return { type: "condition", field, operator, value: "" };
	}
	const current = valueSource.value;
	const scalar =
		typeof current === "string" || typeof current === "number"
			? current
			: fallback !== undefined
				? toScalar(field, fallback)
				: isDateField(field)
					? todayDateOnly()
					: 0;
	return { type: "condition", field, operator, value: scalar };
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

/** Position-based React keys: editing a leaf keeps its input mounted. */
export const keyedFilterNodes = (
	nodes: IssueFilterNode[],
	parentPath: number[] = [],
) => {
	const keys = filterNodeKeys(nodes, parentPath);
	return nodes.map((node, index) => ({
		key: keys[index],
		node,
		index,
	}));
};

/** Replaces a node addressed by a child-index path from the root group. */
export const replaceNode = (
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
			return child.type === "group" ? replaceNode(child, rest, node) : child;
		}),
	};
};

/** Removes a node by path; empty groups are pruned. */
export const removeNode = (
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
		const next = removeNode(child, rest);
		return next.children.length > 0 ? [next] : [];
	});
	return { ...root, children };
};
