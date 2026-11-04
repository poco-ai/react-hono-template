import type { ProjectDto } from "@api/dto/project.dto";
import type { StatusDto } from "@api/dto/status.dto";
import {
	ISSUE_FILTER_FIELDS,
	ISSUE_FILTER_MAX_CONDITIONS,
	ISSUE_PRIORITIES,
	type IssueFilterCondition,
	type IssueFilterField,
	type IssueFilterGroup,
	type IssueFilterNode,
	type IssueFilterOperator,
	type IssueFilterScalar,
	issueFilterNodeSchema,
	priorityName,
} from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import { ListFilter, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MultiSelect } from "@/components/multi-select";
import type { TranslationKey } from "@/lib/errors";
import {
	emptyFilter,
	filterConditionCount,
	filterNodeKeys,
	filterScalarLabel,
	isListOperator,
	isNullOperator,
	isRangeOperator,
	operatorsForField,
} from "../query";
import { DateField } from "./date-field";

type MemberOption = { userId: string; user: { name: string } };
type LabelOption = { id: string; name: string };
type ProjectOption = Pick<ProjectDto, "id" | "name" | "key">;

const FIELD_LABEL_KEYS: Record<IssueFilterField, TranslationKey> = {
	statusId: "issues.filterFields.statusId",
	priority: "issues.filterFields.priority",
	assigneeId: "issues.filterFields.assigneeId",
	createdById: "issues.filterFields.createdById",
	labelId: "issues.filterFields.labelId",
	projectId: "issues.filterFields.projectId",
	dueDate: "issues.filterFields.dueDate",
	createdAt: "issues.filterFields.createdAt",
	updatedAt: "issues.filterFields.updatedAt",
	estimate: "issues.filterFields.estimate",
};

const OPERATOR_LABEL_KEYS: Record<IssueFilterOperator, TranslationKey> = {
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

const isDateField = (field: IssueFilterField) =>
	field === "dueDate" || field === "createdAt" || field === "updatedAt";

const isNumericField = (field: IssueFilterField) =>
	field === "priority" || field === "estimate";

const isMemberField = (field: IssueFilterField) =>
	field === "assigneeId" || field === "createdById";

const todayInputValue = () => {
	const now = new Date();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
};

const toScalar = (field: IssueFilterField, raw: string): IssueFilterScalar =>
	isNumericField(field) ? Number(raw) : raw;

const listOptions = (
	field: IssueFilterField,
	{ statuses, members, labels, projects }: FilterValueSources,
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
	return projects.map((project) => ({
		value: project.id,
		label: `${project.key} · ${project.name}`,
	}));
};

type FilterValueSources = {
	statuses: StatusDto[];
	members: MemberOption[];
	labels: LabelOption[];
	projects: ProjectOption[];
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
			value: todayInputValue(),
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
const resetCondition = (
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
		const date = todayInputValue();
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
					? todayInputValue()
					: 0;
	return { type: "condition", field, operator, value: scalar };
};

function ScalarValueControl({
	condition,
	sources,
	onChange,
}: {
	condition: IssueFilterCondition;
	sources: FilterValueSources;
	onChange: (value: IssueFilterScalar) => void;
}) {
	const { t } = useTranslation();
	const field = condition.field;
	const value =
		typeof condition.value === "string" || typeof condition.value === "number"
			? String(condition.value)
			: "";

	if (condition.operator === "contains") {
		return (
			<Input
				className="h-8 w-40"
				value={value}
				placeholder={t("issues.filters.containsPlaceholder")}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	}
	if (isDateField(field)) {
		return (
			<DateField
				className="h-8 w-40 text-sm"
				value={value}
				onChange={onChange}
			/>
		);
	}
	if (field === "estimate") {
		return (
			<Input
				type="number"
				className="h-8 w-24"
				min={0}
				max={100}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
		);
	}

	const options =
		field === "priority"
			? ISSUE_PRIORITIES.map((priority) => ({
					value: String(priority.value),
					label: t(`issues.priorities.${priority.name}`),
				}))
			: listOptions(field, sources);
	return (
		<Select
			value={value}
			onValueChange={(next) => next && onChange(toScalar(field, next))}
		>
			<SelectTrigger className="h-8 w-40 text-sm">
				<SelectValue>
					{options.find((o) => o.value === value)?.label}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function ListValueControl({
	condition,
	sources,
	onChange,
}: {
	condition: IssueFilterCondition;
	sources: FilterValueSources;
	onChange: (value: IssueFilterScalar[]) => void;
}) {
	const { t } = useTranslation();
	const field = condition.field;
	const values = Array.isArray(condition.value)
		? condition.value.map(String)
		: [];
	const options =
		field === "priority"
			? ISSUE_PRIORITIES.map((priority) => ({
					value: String(priority.value),
					label: t(`issues.priorities.${priority.name}`),
				}))
			: listOptions(field, sources);
	return (
		<MultiSelect
			className="h-8 max-w-56 text-sm"
			placeholder={t("issues.filters.selectValues")}
			value={values}
			options={options}
			onChange={(next) => onChange(next.map((item) => toScalar(field, item)))}
		/>
	);
}

function RangeValueControl({
	condition,
	onChange,
}: {
	condition: IssueFilterCondition;
	onChange: (value: IssueFilterScalar[]) => void;
}) {
	const { t } = useTranslation();
	const field = condition.field;
	const pair = Array.isArray(condition.value) ? condition.value : [];
	const first = pair[0];
	const second = pair[1];
	const update = (index: 0 | 1, raw: string) => {
		const next: IssueFilterScalar[] = [first ?? 0, second ?? 0];
		next[index] = isNumericField(field) ? Number(raw) : raw;
		onChange(next);
	};
	return (
		<div className="flex items-center gap-1.5">
			{isDateField(field) ? (
				<>
					<DateField
						className="h-8 w-36 text-sm"
						value={String(first ?? "")}
						onChange={(next) => update(0, next)}
					/>
					<span className="text-muted-foreground text-xs">
						{t("issues.filters.betweenSeparator")}
					</span>
					<DateField
						className="h-8 w-36 text-sm"
						value={String(second ?? "")}
						onChange={(next) => update(1, next)}
					/>
				</>
			) : (
				<>
					<Input
						type="number"
						className="h-8 w-20"
						value={String(first ?? "")}
						onChange={(event) => update(0, event.target.value)}
					/>
					<span className="text-muted-foreground text-xs">
						{t("issues.filters.betweenSeparator")}
					</span>
					<Input
						type="number"
						className="h-8 w-20"
						value={String(second ?? "")}
						onChange={(event) => update(1, event.target.value)}
					/>
				</>
			)}
		</div>
	);
}

function ConditionValue({
	condition,
	sources,
	onChange,
}: {
	condition: IssueFilterCondition;
	sources: FilterValueSources;
	onChange: (value: IssueFilterCondition["value"]) => void;
}) {
	if (isNullOperator(condition.operator)) {
		return null;
	}
	if (isListOperator(condition.operator)) {
		return (
			<ListValueControl
				condition={condition}
				sources={sources}
				onChange={onChange}
			/>
		);
	}
	if (isRangeOperator(condition.operator)) {
		return <RangeValueControl condition={condition} onChange={onChange} />;
	}
	return (
		<ScalarValueControl
			condition={condition}
			sources={sources}
			onChange={onChange}
		/>
	);
}

function ConditionRow({
	condition,
	sources,
	onChange,
	onRemove,
}: {
	condition: IssueFilterCondition;
	sources: FilterValueSources;
	onChange: (next: IssueFilterCondition) => void;
	onRemove: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="bg-muted/30 flex flex-wrap items-center gap-1.5 rounded-md border p-2">
			<Select
				value={condition.field}
				onValueChange={(next) =>
					next &&
					onChange(
						resetCondition(
							condition,
							{ field: next as IssueFilterField },
							sources,
						),
					)
				}
			>
				<SelectTrigger className="h-8 w-32 text-sm">
					<SelectValue>{t(FIELD_LABEL_KEYS[condition.field])}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{ISSUE_FILTER_FIELDS.map((field) => (
						<SelectItem key={field} value={field}>
							{t(FIELD_LABEL_KEYS[field])}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={condition.operator}
				onValueChange={(next) =>
					next &&
					onChange(
						resetCondition(
							condition,
							{ operator: next as IssueFilterOperator },
							sources,
						),
					)
				}
			>
				<SelectTrigger className="h-8 w-28 text-sm">
					<SelectValue>
						{t(OPERATOR_LABEL_KEYS[condition.operator])}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{operatorsForField(condition.field).map((operator) => (
						<SelectItem key={operator} value={operator}>
							{t(OPERATOR_LABEL_KEYS[operator])}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<ConditionValue
				condition={condition}
				sources={sources}
				onChange={(value) => onChange({ ...condition, value })}
			/>
			<Button
				variant="ghost"
				size="icon"
				className="ml-auto size-7"
				aria-label={t("issues.filters.removeCondition")}
				onClick={onRemove}
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}

/** Position-based React keys: editing a leaf keeps its input mounted. */
const keyedFilterNodes = (
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

function NodeEditor({
	node,
	path,
	root,
	sources,
	onDraftChange,
}: {
	node: IssueFilterNode;
	path: number[];
	root: IssueFilterGroup;
	sources: FilterValueSources;
	onDraftChange: (next: IssueFilterGroup) => void;
}) {
	const { t } = useTranslation();
	const replace = (next: IssueFilterNode) => {
		onDraftChange(replaceNode(root, path, next));
	};
	const remove = () => {
		onDraftChange(removeNode(root, path));
	};

	if (node.type === "condition") {
		return (
			<ConditionRow
				condition={node}
				sources={sources}
				onChange={replace}
				onRemove={remove}
			/>
		);
	}
	const canAddNested = filterConditionCount(root) < ISSUE_FILTER_MAX_CONDITIONS;
	return (
		<div className="rounded-md border p-2">
			<div className="mb-2 flex flex-wrap items-center gap-2">
				<Select
					value={node.op}
					onValueChange={(next) =>
						next && replace({ ...node, op: next as "and" | "or" })
					}
				>
					<SelectTrigger className="h-7 w-32 text-xs">
						<SelectValue>
							{node.op === "and"
								? t("issues.filters.matchAll")
								: t("issues.filters.matchAny")}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="and">{t("issues.filters.matchAll")}</SelectItem>
						<SelectItem value="or">{t("issues.filters.matchAny")}</SelectItem>
					</SelectContent>
				</Select>
				<Button
					variant="ghost"
					size="icon"
					className="ml-auto size-7"
					aria-label={t("issues.filters.removeGroup")}
					onClick={remove}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
			<div className="flex flex-col gap-1.5">
				{keyedFilterNodes(node.children, path).map((entry) => (
					<NodeEditor
						key={entry.key}
						node={entry.node}
						path={[...path, entry.index]}
						root={root}
						sources={sources}
						onDraftChange={onDraftChange}
					/>
				))}
				<Button
					variant="outline"
					size="sm"
					className="w-fit"
					disabled={!canAddNested}
					onClick={() =>
						replace({
							...node,
							children: [
								...node.children,
								defaultConditionFor("statusId", sources),
							],
						})
					}
				>
					<Plus className="size-3.5" />
					{t("issues.filters.addCondition")}
				</Button>
			</div>
		</div>
	);
}

const replaceNode = (
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

const removeNode = (
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

interface QueryBuilderProps extends FilterValueSources {
	filter?: IssueFilterGroup;
	onChange: (next: IssueFilterGroup | undefined) => void;
	stacked?: boolean;
}

/**
 * Structured AND/OR filter editor. Changes stay in a local draft until Apply
 * so a partially edited condition never hits the issue list.
 */
export function IssueQueryBuilder({
	filter,
	statuses,
	members,
	labels,
	projects,
	onChange,
	stacked,
}: QueryBuilderProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<IssueFilterGroup>(filter ?? emptyFilter());
	const sources: FilterValueSources = { statuses, members, labels, projects };
	const appliedKey = JSON.stringify(filter ?? emptyFilter());

	useEffect(() => {
		if (!open) {
			setDraft(JSON.parse(appliedKey) as IssueFilterGroup);
		}
	}, [open, appliedKey]);

	const draftKey = JSON.stringify(draft);
	const pending = appliedKey !== draftKey;
	const empty = draft.children.length === 0;
	const validation = empty
		? { success: true as const }
		: issueFilterNodeSchema.safeParse(draft);
	const conditionCount = filterConditionCount(draft);
	const canAddCondition = conditionCount < ISSUE_FILTER_MAX_CONDITIONS;

	const addCondition = () => {
		if (!canAddCondition) {
			return;
		}
		setDraft((current) => ({
			...current,
			children: [...current.children, defaultConditionFor("statusId", sources)],
		}));
	};

	const addGroup = () => {
		if (!canAddCondition) {
			return;
		}
		setDraft((current) => ({
			...current,
			children: [
				...current.children,
				{
					type: "group",
					op: "or",
					children: [
						defaultConditionFor("statusId", sources),
						defaultConditionFor("priority", sources),
					],
				},
			],
		}));
	};

	const apply = () => {
		onChange(empty ? undefined : draft);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setDraft(
						filter
							? (JSON.parse(JSON.stringify(filter)) as IssueFilterGroup)
							: emptyFilter(),
					);
				}
			}}
		>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className={cn(
							"h-8 gap-1.5 text-sm",
							stacked && "w-full justify-start",
							(filter?.children.length ?? 0) > 0 && "border-foreground/30",
						)}
					/>
				}
			>
				<ListFilter className="size-4" />
				{t("issues.filters.add")}
				{conditionCount > 0 && (
					<Badge variant="secondary" className="rounded-full px-1.5 text-xs">
						{conditionCount}
					</Badge>
				)}
				{pending && (
					<Badge variant="outline" className="rounded-full px-1.5 text-xs">
						{t("issues.filters.pendingBadge")}
					</Badge>
				)}
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="max-h-[70svh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-xs">
						{t("issues.filters.matchLabel")}
					</span>
					<Select
						value={draft.op}
						onValueChange={(next) =>
							next && setDraft({ ...draft, op: next as "and" | "or" })
						}
					>
						<SelectTrigger className="h-7 w-32 text-xs">
							<SelectValue>
								{draft.op === "and"
									? t("issues.filters.matchAll")
									: t("issues.filters.matchAny")}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="and">
								{t("issues.filters.matchAll")}
							</SelectItem>
							<SelectItem value="or">{t("issues.filters.matchAny")}</SelectItem>
						</SelectContent>
					</Select>
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto"
						disabled={empty}
						onClick={() => setDraft(emptyFilter())}
					>
						{t("issues.filters.clearAll")}
					</Button>
				</div>

				<div className="flex flex-col gap-1.5">
					{keyedFilterNodes(draft.children).map((entry) => (
						<NodeEditor
							key={entry.key}
							node={entry.node}
							path={[entry.index]}
							root={draft}
							sources={sources}
							onDraftChange={setDraft}
						/>
					))}
					{empty && (
						<p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
							{t("issues.filters.empty")}
						</p>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						disabled={!canAddCondition}
						onClick={addCondition}
					>
						<Plus className="size-3.5" />
						{t("issues.filters.addCondition")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!canAddCondition}
						onClick={addGroup}
					>
						<Plus className="size-3.5" />
						{t("issues.filters.addGroup")}
					</Button>
					<span className="text-muted-foreground ml-auto text-xs">
						{t("issues.filters.conditionCount", {
							count: conditionCount,
							max: ISSUE_FILTER_MAX_CONDITIONS,
						})}
					</span>
				</div>

				{!validation.success && (
					<p className="text-destructive text-xs">
						{t("issues.filters.invalid")}
					</p>
				)}

				<div className="flex items-center justify-end gap-2 border-t pt-2">
					<span className="text-muted-foreground mr-auto text-xs">
						{pending
							? t("issues.filters.pending", { count: conditionCount })
							: t("issues.filters.noPending")}
					</span>
					<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
						{t("common.cancel")}
					</Button>
					<Button size="sm" disabled={!validation.success} onClick={apply}>
						{t("issues.filters.apply")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

/** Removable chips for the applied root conditions. */
export function IssueFilterChips({
	filter,
	statuses,
	members,
	labels,
	projects,
	onChange,
	className,
}: FilterValueSources & {
	filter?: IssueFilterGroup;
	onChange: (next: IssueFilterGroup | undefined) => void;
	className?: string;
}) {
	const { t } = useTranslation();
	const sourceMaps = {
		statuses: new Map(statuses.map((status) => [status.id, status.name])),
		members: new Map(
			members.map((member) => [member.userId, member.user.name]),
		),
		labels: new Map(labels.map((label) => [label.id, label.name])),
		projects: new Map(
			projects.map((project) => [
				project.id,
				`${project.key} · ${project.name}`,
			]),
		),
	};

	const valueLabel = (condition: IssueFilterCondition) => {
		if (isNullOperator(condition.operator)) {
			return null;
		}
		const values = Array.isArray(condition.value)
			? condition.value
			: condition.value === undefined
				? []
				: [condition.value];
		const field = condition.field;
		const labelsFor = (value: IssueFilterScalar) => {
			const raw = String(value);
			if (field === "statusId") {
				return sourceMaps.statuses.get(raw) ?? raw;
			}
			if (field === "assigneeId" || field === "createdById") {
				return sourceMaps.members.get(raw) ?? raw;
			}
			if (field === "labelId") {
				return sourceMaps.labels.get(raw) ?? raw;
			}
			if (field === "projectId") {
				return sourceMaps.projects.get(raw) ?? raw;
			}
			if (field === "priority") {
				return t(`issues.priorities.${priorityName(Number(value))}`);
			}
			return filterScalarLabel(field, value);
		};
		return values.map(labelsFor).join(", ");
	};

	if (!filter || filter.children.length === 0) {
		return null;
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-1.5", className)}>
			{keyedFilterNodes(filter.children).map((entry) => {
				const { index, node } = entry;
				const summary =
					node.type === "group"
						? t("issues.filters.groupChip", {
								count: filterConditionCount(node),
							})
						: [
								t(FIELD_LABEL_KEYS[node.field]),
								t(OPERATOR_LABEL_KEYS[node.operator]),
								valueLabel(node),
							]
								.filter(Boolean)
								.join(" ");
				return (
					<Badge
						key={entry.key}
						variant="secondary"
						className="gap-1 rounded-md"
					>
						<span className="max-w-64 truncate">{summary}</span>
						<Button
							variant="ghost"
							size="icon"
							className="text-muted-foreground hover:text-foreground size-4"
							aria-label={t("issues.filters.removeCondition")}
							onClick={() => {
								const next = removeNode(filter, [index]);
								onChange(next.children.length > 0 ? next : undefined);
							}}
						>
							<X className="size-3" />
						</Button>
					</Badge>
				);
			})}
		</div>
	);
}
