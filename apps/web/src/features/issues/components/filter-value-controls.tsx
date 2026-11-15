import {
	ISSUE_PRIORITIES,
	type IssueFilterCondition,
	type IssueFilterScalar,
} from "@workspace/shared";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { useTranslation } from "react-i18next";
import { MultiSelect } from "@/components/multi-select";
import {
	type FilterValueSources,
	isDateField,
	isListOperator,
	isNullOperator,
	isNumericField,
	isRangeOperator,
	listOptions,
	toScalar,
} from "../filter-tree";
import { IssueDueDateField } from "./issue-due-date-field";

/** Value editor for a single scalar condition (select, date, number, text). */
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
			<IssueDueDateField
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

/** Multi-select value editor for `in` / `notIn` conditions. */
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

/** Two-input value editor for `between` conditions (dates or numbers). */
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
					<IssueDueDateField
						className="h-8 w-36 text-sm"
						value={String(first ?? "")}
						onChange={(next) => update(0, next)}
					/>
					<span className="text-muted-foreground text-xs">
						{t("issues.filters.betweenSeparator")}
					</span>
					<IssueDueDateField
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

/** Picks the editor that matches the condition's operator. */
export function ConditionValue({
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
