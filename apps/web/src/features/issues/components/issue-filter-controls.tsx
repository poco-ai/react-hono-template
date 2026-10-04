import {
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
	serializeCsv,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
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
import type { IssuesSearch } from "../search";

const ASSIGNEE_ALL = "__all__";
const LABEL_ALL = "__all__";

export function IssueFilterControls({
	variant,
	statusFilter,
	priorityFilter,
	assigneeId,
	assigneeFilterActive,
	assigneeFilterLabel,
	labelId,
	labelFilterActive,
	labelFilterLabel,
	members,
	labels,
	showSort,
	sort,
	searchInput,
	searchInputRef,
	hasFilters,
	onSearchInput,
	onSearchSubmit,
	onUpdateSearch,
}: {
	variant: "inline" | "sheet";
	statusFilter: IssueStatus[];
	priorityFilter: IssuePriorityName[];
	assigneeId?: string;
	assigneeFilterActive: boolean;
	assigneeFilterLabel: string;
	labelId?: string;
	labelFilterActive: boolean;
	labelFilterLabel: string;
	members: { userId: string; user: { name: string } }[];
	labels: { id: string; name: string }[];
	showSort: boolean;
	sort: IssuesSearch["sort"];
	searchInput: string;
	searchInputRef: RefObject<HTMLInputElement | null>;
	hasFilters: boolean;
	onSearchInput: (value: string) => void;
	onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onUpdateSearch: (next: Partial<IssuesSearch>) => void;
}) {
	const { t } = useTranslation();
	const stacked = variant === "sheet";
	const summarize = (labels: string[]) =>
		labels.length === 0
			? t("common.all")
			: labels.length === 1
				? labels[0]
				: `${labels[0]} +${labels.length - 1}`;
	const statusValue = summarize(
		statusFilter.map((status) => t(`issues.statuses.${status}`)),
	);
	const priorityValue = summarize(
		priorityFilter.map((name) => t(`issues.priorities.${name}`)),
	);

	return (
		<>
			<MultiSelect
				className={cn("h-8 text-sm", stacked && "w-full")}
				placeholder={t("issues.filterStatus")}
				triggerLabel={`${t("issues.filterStatus")}: ${statusValue}`}
				active={statusFilter.length > 0}
				value={statusFilter}
				options={ISSUE_STATUSES.map((status) => ({
					value: status,
					label: t(`issues.statuses.${status}`),
				}))}
				onChange={(next) =>
					onUpdateSearch({ status: serializeCsv(next), page: 1 })
				}
			/>
			<MultiSelect
				className={cn("h-8 text-sm", stacked && "w-full")}
				placeholder={t("issues.filterPriority")}
				triggerLabel={`${t("issues.filterPriority")}: ${priorityValue}`}
				active={priorityFilter.length > 0}
				value={priorityFilter}
				options={ISSUE_PRIORITIES.map(({ name }) => ({
					value: name,
					label: t(`issues.priorities.${name}`),
				}))}
				onChange={(next) =>
					onUpdateSearch({ priority: serializeCsv(next), page: 1 })
				}
			/>
			<Select
				value={assigneeId ?? ASSIGNEE_ALL}
				onValueChange={(value) =>
					onUpdateSearch({
						assigneeId: value && value !== ASSIGNEE_ALL ? value : undefined,
						page: 1,
					})
				}
			>
				<SelectTrigger
					className={cn(
						stacked ? "w-full" : "w-44",
						assigneeFilterActive && "border-foreground/30",
					)}
				>
					<SelectValue>
						<span className="text-muted-foreground">
							{t("issues.filterAssignee")}:
						</span>
						<span
							className={cn(!assigneeFilterActive && "text-muted-foreground")}
						>
							{assigneeFilterLabel}
						</span>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ASSIGNEE_ALL}>{t("common.all")}</SelectItem>
					<SelectItem value="none">{t("common.unassigned")}</SelectItem>
					{members.map((member) => (
						<SelectItem key={member.userId} value={member.userId}>
							{member.user.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={labelId ?? LABEL_ALL}
				onValueChange={(value) =>
					onUpdateSearch({
						labelId: value && value !== LABEL_ALL ? value : undefined,
						page: 1,
					})
				}
			>
				<SelectTrigger
					className={cn(
						stacked ? "w-full" : "w-40",
						labelFilterActive && "border-foreground/30",
					)}
				>
					<SelectValue>
						<span className="text-muted-foreground">
							{t("issues.filterLabel")}:
						</span>
						<span className={cn(!labelFilterActive && "text-muted-foreground")}>
							{labelFilterLabel}
						</span>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={LABEL_ALL}>{t("common.all")}</SelectItem>
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
				<div className={cn("relative", stacked && "w-full")}>
					<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
					<Input
						ref={searchInputRef}
						value={searchInput}
						placeholder={t("issues.searchPlaceholder")}
						onChange={(e) => onSearchInput(e.target.value)}
						className={cn("pl-8", stacked ? "h-9 w-full" : "h-8 w-56")}
						title="/"
					/>
				</div>
			</form>
			{showSort && (
				<Select
					value={sort}
					onValueChange={(value) =>
						onUpdateSearch({ sort: value as IssuesSearch["sort"] })
					}
				>
					<SelectTrigger className={stacked ? "w-full" : "w-40"}>
						<SelectValue>{t(`issues.sortOptions.${sort}`)}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="updated">
							{t("issues.sortOptions.updated")}
						</SelectItem>
						<SelectItem value="created">
							{t("issues.sortOptions.created")}
						</SelectItem>
						<SelectItem value="priority">
							{t("issues.sortOptions.priority")}
						</SelectItem>
					</SelectContent>
				</Select>
			)}
			{hasFilters && (
				<Button
					variant="ghost"
					size="sm"
					className={cn(stacked && "justify-center")}
					onClick={() =>
						onUpdateSearch({
							status: "",
							priority: "",
							assigneeId: "",
							labelId: "",
							search: "",
							page: 1,
						})
					}
				>
					{t("issues.clearFilters")}
				</Button>
			)}
		</>
	);
}
