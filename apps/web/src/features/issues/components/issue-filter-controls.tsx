import type { ProjectDto } from "@api/dto/project.dto";
import type { StatusDto } from "@api/dto/status.dto";
import {
	ISSUE_PRIORITIES,
	ISSUE_QUERY_SORT_FIELDS,
	type IssueFilterCondition,
	type IssueFilterField,
	type IssueFilterGroup,
	type IssueFilterScalar,
	type IssueQuerySortField,
	priorityName,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@workspace/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import { Search } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { MultiSelect } from "@/components/multi-select";
import { assigneeSelection, filterSelection, setFieldFilter } from "../query";
import type { IssuesSearch } from "../search";
import { IssueFilterChips, IssueQueryBuilder } from "./query-builder";

const ALL = "__all__";
const UNASSIGNED = "none";

type FilterFieldSources = {
	statuses: StatusDto[];
	members: { userId: string; user: { name: string } }[];
	labels: { id: string; name: string }[];
	projects: Pick<ProjectDto, "id" | "name" | "key">[];
};

const singleCondition = (
	field: IssueFilterField,
	values: IssueFilterScalar[],
): IssueFilterCondition[] => {
	if (values.length === 0) {
		return [];
	}
	return [
		{
			type: "condition",
			field,
			operator: values.length > 1 ? "in" : "eq",
			value: values.length > 1 ? values : values[0],
		},
	];
};

export function IssueFilterControls({
	variant,
	filter,
	statuses,
	members,
	labels,
	projects,
	showSort,
	sort,
	searchInput,
	searchInputRef,
	hasFilters,
	onSearchInput,
	onSearchSubmit,
	onUpdateSearch,
	onFilterChange,
	onClearFilters,
}: {
	variant: "inline" | "sheet";
	filter?: IssueFilterGroup;
	showSort: boolean;
	sort: IssueQuerySortField;
	searchInput: string;
	searchInputRef: RefObject<HTMLInputElement | null>;
	hasFilters: boolean;
	onSearchInput: (value: string) => void;
	onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onUpdateSearch: (next: Partial<IssuesSearch>) => void;
	onFilterChange: (next: IssueFilterGroup | undefined) => void;
	/** Clears filters through the page so view detachment stays consistent. */
	onClearFilters: () => void;
} & FilterFieldSources) {
	const { t } = useTranslation();
	const stacked = variant === "sheet";
	const summarize = (values: string[]) =>
		values.length === 0
			? t("common.all")
			: values.length === 1
				? values[0]
				: `${values[0]} +${values.length - 1}`;

	const statusFilter = filterSelection(filter, "statusId");
	const priorityFilter = filterSelection(filter, "priority")
		.map(Number)
		.filter((value) => ISSUE_PRIORITIES.some((entry) => entry.value === value));
	const assigneeId = assigneeSelection(filter);
	const labelId = filterSelection(filter, "labelId")[0];

	const statusValue = summarize(
		statusFilter
			.map((id) => statuses.find((status) => status.id === id)?.name)
			.filter((name): name is string => Boolean(name)),
	);
	const priorityValue = summarize(
		priorityFilter.map((value) =>
			t(`issues.priorities.${priorityName(value)}`),
		),
	);
	const memberById = new Map(members.map((member) => [member.userId, member]));
	const labelById = new Map(labels.map((label) => [label.id, label]));
	const assigneeFilterLabel =
		assigneeId === undefined
			? t("common.all")
			: assigneeId === UNASSIGNED
				? t("common.unassigned")
				: (memberById.get(assigneeId)?.user.name ?? t("common.all"));
	const labelFilterLabel = labelId
		? (labelById.get(labelId)?.name ?? t("common.all"))
		: t("common.all");

	const changeField = (
		field: IssueFilterField,
		conditions: IssueFilterCondition[],
	) => {
		const next = setFieldFilter(filter, field, conditions);
		onFilterChange(next.children.length > 0 ? next : undefined);
	};

	return (
		<>
			<IssueQueryBuilder
				filter={filter}
				statuses={statuses}
				members={members}
				labels={labels}
				projects={projects}
				stacked={stacked}
				onChange={onFilterChange}
			/>
			<MultiSelect
				className={cn("h-8 text-sm", stacked && "w-full")}
				placeholder={t("issues.filterStatus")}
				triggerLabel={`${t("issues.filterStatus")}: ${statusValue}`}
				active={statusFilter.length > 0}
				value={statusFilter}
				options={statuses.map((status) => ({
					value: status.id,
					label: status.name,
				}))}
				onChange={(next) =>
					changeField("statusId", singleCondition("statusId", next))
				}
			/>
			<MultiSelect
				className={cn("h-8 text-sm", stacked && "w-full")}
				placeholder={t("issues.filterPriority")}
				triggerLabel={`${t("issues.filterPriority")}: ${priorityValue}`}
				active={priorityFilter.length > 0}
				value={priorityFilter.map(String)}
				options={ISSUE_PRIORITIES.map(({ value, name }) => ({
					value: String(value),
					label: t(`issues.priorities.${name}`),
				}))}
				onChange={(next) =>
					changeField(
						"priority",
						singleCondition(
							"priority",
							next.map(Number).filter((value) => Number.isFinite(value)),
						),
					)
				}
			/>
			<Select
				value={assigneeId ?? ALL}
				onValueChange={(value) => {
					if (!value || value === ALL) {
						changeField("assigneeId", []);
					} else if (value === UNASSIGNED) {
						changeField("assigneeId", [
							{
								type: "condition",
								field: "assigneeId",
								operator: "isNull",
							},
						]);
					} else {
						changeField("assigneeId", [
							{
								type: "condition",
								field: "assigneeId",
								operator: "eq",
								value,
							},
						]);
					}
				}}
			>
				<SelectTrigger
					className={cn(
						stacked ? "w-full" : "w-44",
						assigneeId !== undefined && "border-foreground/30",
					)}
				>
					<SelectValue>
						<span className="text-muted-foreground">
							{t("issues.filterAssignee")}:
						</span>
						<span
							className={cn(
								assigneeId === undefined && "text-muted-foreground",
							)}
						>
							{assigneeFilterLabel}
						</span>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>{t("common.all")}</SelectItem>
					<SelectItem value={UNASSIGNED}>{t("common.unassigned")}</SelectItem>
					{members.map((member) => (
						<SelectItem key={member.userId} value={member.userId}>
							{member.user.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={labelId ?? ALL}
				onValueChange={(value) =>
					changeField(
						"labelId",
						value && value !== ALL
							? [
									{
										type: "condition",
										field: "labelId",
										operator: "eq",
										value,
									},
								]
							: [],
					)
				}
			>
				<SelectTrigger
					className={cn(
						stacked ? "w-full" : "w-40",
						labelId !== undefined && "border-foreground/30",
					)}
				>
					<SelectValue>
						<span className="text-muted-foreground">
							{t("issues.filterLabel")}:
						</span>
						<span className={cn(!labelId && "text-muted-foreground")}>
							{labelFilterLabel}
						</span>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>{t("common.all")}</SelectItem>
					{labels.map((label) => (
						<SelectItem key={label.id} value={label.id}>
							{label.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<form
				className={cn("flex items-center gap-2", stacked && "w-full")}
				onSubmit={onSearchSubmit}
			>
				<InputGroup className={cn(stacked ? "h-9 w-full" : "w-56")}>
					<InputGroupAddon align="inline-start">
						<Search />
					</InputGroupAddon>
					<InputGroupInput
						ref={searchInputRef}
						value={searchInput}
						placeholder={t("issues.searchPlaceholder")}
						onChange={(e) => onSearchInput(e.target.value)}
						title="/"
					/>
				</InputGroup>
			</form>
			{showSort && (
				<Select
					value={sort}
					onValueChange={(value) =>
						onUpdateSearch({
							sort: value as IssuesSearch["sort"],
							page: 1,
						})
					}
				>
					<SelectTrigger className={stacked ? "w-full" : "w-40"}>
						<SelectValue>{t(`issues.sortOptions.${sort}`)}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{ISSUE_QUERY_SORT_FIELDS.map((field) => (
							<SelectItem key={field} value={field}>
								{t(`issues.sortOptions.${field}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			{hasFilters && (
				<Button
					variant="ghost"
					size="sm"
					className={cn(stacked && "justify-center")}
					onClick={onClearFilters}
				>
					{t("issues.clearFilters")}
				</Button>
			)}
			<IssueFilterChips
				filter={filter}
				statuses={statuses}
				members={members}
				labels={labels}
				projects={projects}
				onChange={onFilterChange}
				className={cn("w-full", !stacked && "mt-1")}
			/>
		</>
	);
}
