import type { IssueDetailDto, ListIssuesDto } from "@api/dto/issue.dto";
import type { LabelDto } from "@api/dto/label.dto";
import type { StatusDto } from "@api/dto/status.dto";
import type { UseQueryResult } from "@tanstack/react-query";
import type { IssueQueryGroupBy } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import { UserAvatar } from "@/components/user-avatar";
import { IssueDeleteDialog } from "@/features/issues/components/issue-delete-dialog";
import {
	ISSUE_COLUMN_CLASS,
	IssueListRow,
} from "@/features/issues/components/issue-list-row";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { LabelBadge } from "@/features/labels/components/label-badge";
import type { OrgMember } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDate, formatDueDate, getDueDateStatus } from "@/lib/format";
import type { IssueFilters } from "../data";
import { useDeleteIssue } from "../data";
import { groupIssues } from "../grouping";
import type { IssueListColumn, IssueListDensity } from "../list-preferences";

const COLUMN_LABEL = {
	status: "issues.columns.status",
	priority: "issues.columns.priority",
	assignee: "issues.columns.assignee",
	labels: "issues.columns.labels",
	dueDate: "issues.columns.dueDate",
	createdAt: "issues.columns.createdAt",
	updatedAt: "issues.columns.updatedAt",
	estimate: "issues.columns.estimate",
} as const satisfies Record<IssueListColumn, string>;

export function IssueList({
	orgId,
	projectId,
	projectKey,
	issues,
	members,
	labels,
	statuses,
	page,
	selected,
	frozen,
	hasFilters,
	filters,
	columns,
	density,
	groupBy,
	toggleAllOnPage,
	toggleOne,
	onPageChange,
	onClearFilters,
	onNewIssue,
}: {
	orgId: string;
	projectId: string;
	projectKey: string;
	issues: UseQueryResult<ListIssuesDto, Error>;
	members: OrgMember[];
	labels: LabelDto[];
	statuses: StatusDto[];
	page: number;
	selected: Set<string>;
	frozen: boolean;
	hasFilters: boolean;
	/** Same request state as the list query, used for optimistic edits. */
	filters: IssueFilters;
	columns: readonly IssueListColumn[];
	density: IssueListDensity;
	groupBy: IssueQueryGroupBy | undefined;
	toggleAllOnPage: (checked: boolean) => void;
	toggleOne: (id: string, checked: boolean) => void;
	onPageChange: (page: number) => void;
	onClearFilters: () => void;
	onNewIssue: () => void;
}) {
	const { t } = useTranslation();
	const result = issues.data;
	const items = result?.items ?? [];
	const listEmpty = !issues.isPending && result?.items.length === 0;
	const totalPages = result
		? Math.max(1, Math.ceil(result.total / result.pageSize))
		: 1;
	const memberById = new Map(members.map((member) => [member.userId, member]));
	const labelById = new Map(labels.map((label) => [label.id, label]));
	const allOnPageSelected =
		(result?.items.length ?? 0) > 0 &&
		result?.items.every((issue) => selected.has(issue.id));
	const columnCount = 2 + 1 + columns.length + 1;
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [deleteTarget, setDeleteTarget] = useState<IssueDetailDto | null>(null);
	const deleteMutation = useDeleteIssue(
		orgId,
		projectId,
		deleteTarget?.number ?? 0,
	);

	const groups = groupBy
		? groupIssues(items, groupBy, {
				statusIds: statuses.map((status) => status.id),
				assigneeIds: members.map((member) => member.userId),
				labelIds: labels.map((label) => label.id),
			})
		: [{ key: "all", valueId: null, items }];

	const toggleGroup = (key: string) => {
		setCollapsed((previous) => {
			const next = new Set(previous);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const renderGroupValue = (
		field: IssueQueryGroupBy,
		valueId: string | null,
	) => {
		if (field === "status") {
			const status = valueId
				? statuses.find((entry) => entry.id === valueId)
				: undefined;
			return status ? <StatusBadge status={status} /> : <span>—</span>;
		}
		if (field === "priority") {
			return <PriorityBadge value={Number(valueId ?? 0)} />;
		}
		if (field === "assignee") {
			const member = valueId ? memberById.get(valueId) : undefined;
			return member ? (
				<span className="inline-flex items-center gap-2">
					<UserAvatar name={member.user.name} image={member.user.image} />
					<span className="truncate text-sm">{member.user.name}</span>
				</span>
			) : (
				<span className="text-muted-foreground text-sm">
					{t("common.unassigned")}
				</span>
			);
		}
		const label = valueId ? labelById.get(valueId) : undefined;
		return label ? (
			<LabelBadge label={label} />
		) : (
			<span className="text-muted-foreground text-sm">
				{t("issues.noLabels")}
			</span>
		);
	};

	return (
		<>
			<div
				className="flex-1 overflow-auto px-4 py-4 lg:px-6"
				aria-busy={issues.isPending || undefined}
			>
				<Table>
					{!listEmpty && (
						<TableHeader>
							<TableRow>
								<TableHead className="hidden w-10 md:table-cell">
									<Checkbox
										aria-label={t("bulk.selectAll")}
										checked={allOnPageSelected}
										indeterminate={selected.size > 0 && !allOnPageSelected}
										disabled={frozen}
										onCheckedChange={(checked) => toggleAllOnPage(checked)}
									/>
								</TableHead>
								<TableHead className="w-24">{t("issues.number")}</TableHead>
								<TableHead>{t("issues.titleField")}</TableHead>
								{columns.map((column) => (
									<TableHead
										key={column}
										className={ISSUE_COLUMN_CLASS[column]}
									>
										{t(COLUMN_LABEL[column])}
									</TableHead>
								))}
								<TableHead className="w-10">
									<span className="sr-only">{t("common.actions")}</span>
								</TableHead>
							</TableRow>
						</TableHeader>
					)}
					<TableBody>
						{groups.map((group) => {
							const isCollapsed = collapsed.has(group.key);
							return (
								<Fragment key={group.key}>
									{groupBy && (
										<TableRow className="hover:bg-transparent">
											<TableCell
												colSpan={columnCount}
												className="bg-muted/30 py-1.5"
											>
												<Button
													variant="ghost"
													size="sm"
													className="h-7 gap-1.5 px-1.5"
													aria-expanded={!isCollapsed}
													onClick={() => toggleGroup(group.key)}
												>
													{isCollapsed ? <ChevronRight /> : <ChevronDown />}
													{renderGroupValue(groupBy, group.valueId)}
													<span className="text-muted-foreground text-xs">
														{t("issues.groupCountPage", {
															count: group.items.length,
														})}
													</span>
												</Button>
											</TableCell>
										</TableRow>
									)}
									{!isCollapsed &&
										group.items.map((issue) => (
											<IssueListRow
												key={`${group.key}:${issue.id}`}
												orgId={orgId}
												projectId={projectId}
												projectKey={projectKey}
												issue={issue}
												columns={columns}
												density={density}
												filters={filters}
												selected={selected.has(issue.id)}
												frozen={frozen}
												statuses={statuses}
												members={members}
												memberById={memberById}
												labelById={labelById}
												onToggle={toggleOne}
												onRequestDelete={setDeleteTarget}
											/>
										))}
								</Fragment>
							);
						})}
						{issues.isPending &&
							["row-1", "row-2", "row-3", "row-4", "row-5"].map((rowKey) => (
								<TableRow key={rowKey} aria-hidden="true">
									<TableCell className="hidden md:table-cell">
										<Skeleton className="size-4" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-3.5 w-14" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-3/4" />
									</TableCell>
									{columns.map((column) => (
										<TableCell
											key={column}
											className={ISSUE_COLUMN_CLASS[column]}
										>
											<Skeleton className="h-5 w-16 rounded-md" />
										</TableCell>
									))}
									<TableCell>
										<Skeleton className="size-6 rounded-full" />
									</TableCell>
								</TableRow>
							))}
						{issues.isError && (
							<TableRow>
								<TableCell
									colSpan={columnCount}
									className="text-center text-destructive"
								>
									{apiErrorMessage(t, issues.error)}
								</TableCell>
							</TableRow>
						)}
						{listEmpty && (
							<TableRow>
								<TableCell colSpan={columnCount} className="p-0">
									{hasFilters ? (
										<EmptyState
											title={t("issues.noResults")}
											action={
												<Button
													variant="outline"
													size="sm"
													onClick={() => onClearFilters()}
												>
													{t("issues.clearFilters")}
												</Button>
											}
										/>
									) : (
										<EmptyState
											title={t("issues.empty")}
											action={
												<Button
													variant="outline"
													size="sm"
													disabled={frozen}
													onClick={() => onNewIssue()}
												>
													{t("issues.emptyCta")}
												</Button>
											}
										/>
									)}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm lg:px-6">
				<span className="flex items-center gap-2">
					{issues.isFetching && !issues.isPending && (
						<Spinner className="size-3.5" />
					)}
					{result ? t("issues.count", { count: result.total }) : ""}
				</span>
				{totalPages > 1 && (
					<TablePagination
						page={page}
						total={result?.total}
						totalPages={totalPages}
						onPageChange={onPageChange}
						disabled={issues.isPending}
					/>
				)}
			</footer>

			<IssueDeleteDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
				issueKey={
					deleteTarget
						? `${projectKey}-${deleteTarget.number}`
						: `${projectKey}-`
				}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					deleteMutation.mutate(undefined, {
						onSuccess: () => toast.success(t("toast.issueDeleted")),
						onError: (error) => toast.error(apiErrorMessage(t, error)),
						onSettled: () => setDeleteTarget(null),
					});
				}}
			/>
		</>
	);
}

/** Due date with today/tomorrow labels and overdue emphasis; hover shows the exact date. */
export function DueDateLabel({
	value,
	className,
}: {
	value: string | null | undefined;
	className?: string;
}) {
	const { t } = useTranslation();
	if (!value) {
		return <span className={cn("text-muted-foreground/50", className)}>—</span>;
	}
	const status = getDueDateStatus(value);
	const label =
		status === "today"
			? t("issues.dueToday")
			: status === "tomorrow"
				? t("issues.dueTomorrow")
				: formatDueDate(value);
	return (
		<span
			title={formatDate(value)}
			className={cn(
				"text-muted-foreground whitespace-nowrap",
				status === "overdue" && "text-destructive",
				className,
			)}
		>
			{label}
			{status === "overdue" && <> · {t("issues.dueOverdue")}</>}
		</span>
	);
}
