import type { IssueDetailDto, ListIssuesDto } from "@api/dto/issue.dto";
import type { LabelDto } from "@api/dto/label.dto";
import type { StatusDto } from "@api/dto/status.dto";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { IssueQueryGroupBy } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import { UserAvatar } from "@/components/user-avatar";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { LabelBadge } from "@/features/labels/components/label-badge";
import type { OrgMember } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { groupIssues } from "../grouping";

const MAX_LABELS = 3;

/**
 * Mobile (<768px) replacement for the issue table: one tappable card per
 * issue. Navigation follows the table row semantics — tapping a card opens
 * the issue; in selection mode the card becomes a toggle instead.
 */
export function IssueCardList({
	orgId,
	projectKey,
	issues,
	members,
	labels,
	statuses,
	page,
	selected,
	selectionMode = false,
	frozen,
	hasFilters,
	groupBy,
	toggleOne,
	onPageChange,
	onClearFilters,
	onNewIssue,
	identifierPrefixOf,
}: {
	orgId: string;
	projectKey: string;
	issues: UseQueryResult<ListIssuesDto, Error>;
	members: OrgMember[];
	labels: LabelDto[];
	statuses: StatusDto[];
	page: number;
	selected: Set<string>;
	selectionMode: boolean;
	frozen: boolean;
	hasFilters: boolean;
	groupBy: IssueQueryGroupBy | undefined;
	toggleOne: (id: string, checked: boolean) => void;
	onPageChange: (page: number) => void;
	onClearFilters: () => void;
	onNewIssue: () => void;
	/** Cross-project lists (e.g. My Issues) render a per-issue prefix. */
	identifierPrefixOf?: (issue: IssueDetailDto) => string;
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
	const prefixOf = identifierPrefixOf ?? (() => projectKey);
	// Skip the KEY- separator while the project query is still loading (empty
	// prefix) so identifiers never flash as "-42".
	const identifierOf = (issue: IssueDetailDto) => {
		const prefix = prefixOf(issue);
		return prefix ? `${prefix}-${issue.number}` : `${issue.number}`;
	};

	const groups = groupBy
		? groupIssues(items, groupBy, {
				statusIds: statuses.map((status) => status.id),
				assigneeIds: members.map((member) => member.userId),
				labelIds: labels.map((label) => label.id),
			})
		: [{ key: "all", valueId: null, items }];

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
			return valueId ? (
				<PriorityBadge value={Number(valueId)} />
			) : (
				<span>—</span>
			);
		}
		if (field === "assignee") {
			const member = valueId ? memberById.get(valueId) : undefined;
			return member ? (
				<span className="inline-flex min-w-0 items-center gap-2">
					<UserAvatar
						name={member.user.name}
						image={member.user.image}
						className="size-5 text-[10px]"
					/>
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
				className="flex-1 overflow-auto py-2"
				aria-busy={issues.isPending || undefined}
			>
				{groups.map((group) => (
					<Fragment key={group.key}>
						{groupBy && (
							<div className="bg-muted/50 flex items-center gap-2 px-4 py-1.5">
								{renderGroupValue(groupBy, group.valueId)}
								<span className="text-muted-foreground text-xs">
									{t("issues.groupCountPage", { count: group.items.length })}
								</span>
							</div>
						)}
						{group.items.map((issue) => (
							<IssueCard
								key={`${group.key}:${issue.id}`}
								orgId={orgId}
								issue={issue}
								identifier={identifierOf(issue)}
								isSelected={selected.has(issue.id)}
								selectionMode={selectionMode}
								frozen={frozen}
								memberById={memberById}
								labelById={labelById}
								onToggle={toggleOne}
							/>
						))}
					</Fragment>
				))}
				{issues.isPending &&
					["card-1", "card-2", "card-3", "card-4", "card-5"].map((cardKey) => (
						<div
							key={cardKey}
							aria-hidden="true"
							className="flex flex-col gap-2 border-b px-4 py-3"
						>
							<div className="flex items-center gap-2">
								<Skeleton className="h-5 w-16 rounded-md" />
								<Skeleton className="h-3.5 w-14" />
								<span className="flex-1" />
								<Skeleton className="h-5 w-12 rounded-md" />
							</div>
							<Skeleton className="h-4 w-3/4" />
							<div className="flex items-center gap-2">
								<Skeleton className="h-5 w-12 rounded-md" />
								<span className="flex-1" />
								<Skeleton className="size-6 rounded-full" />
								<Skeleton className="h-3 w-10" />
							</div>
						</div>
					))}
				{issues.isError && (
					<p className="text-destructive px-4 py-6 text-sm">
						{apiErrorMessage(t, issues.error)}
					</p>
				)}
				{listEmpty &&
					(hasFilters ? (
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
					))}
			</div>

			<footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
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
		</>
	);
}

function IssueCard({
	orgId,
	issue,
	identifier,
	isSelected,
	selectionMode,
	frozen,
	memberById,
	labelById,
	onToggle,
}: {
	orgId: string;
	issue: IssueDetailDto;
	identifier: string;
	isSelected: boolean;
	selectionMode: boolean;
	frozen: boolean;
	memberById: Map<string, OrgMember>;
	labelById: Map<string, LabelDto>;
	onToggle: (id: string, checked: boolean) => void;
}) {
	const { t } = useTranslation();
	const assignee = issue.assigneeId
		? memberById.get(issue.assigneeId)
		: undefined;
	const cardLabels = issue.labelIds
		.map((labelId) => labelById.get(labelId))
		.filter((label): label is LabelDto => label !== undefined);

	const body = (
		<>
			<div className="flex items-center gap-2">
				<StatusBadge status={issue.status} className="shrink-0" />
				<span className="text-muted-foreground truncate font-mono text-xs">
					{identifier}
				</span>
				{issue.archivedAt ? (
					<Badge variant="secondary" className="shrink-0 rounded-md">
						{t("issues.archivedBadge")}
					</Badge>
				) : null}
				<span className="min-w-0 flex-1" />
				<PriorityBadge value={issue.priority} className="shrink-0" />
			</div>
			<p className="mt-1 line-clamp-2 min-w-0">{issue.title}</p>
			<div className="mt-1.5 flex items-center gap-2">
				<div className="flex min-w-0 flex-wrap items-center gap-1">
					{cardLabels.slice(0, MAX_LABELS).map((label) => (
						<LabelBadge key={label.id} label={label} className="shrink-0" />
					))}
					{cardLabels.length > MAX_LABELS && (
						<span className="text-muted-foreground text-xs">
							+{cardLabels.length - MAX_LABELS}
						</span>
					)}
				</div>
				<span className="min-w-0 flex-1" />
				{assignee && (
					<UserAvatar
						name={assignee.user.name}
						image={assignee.user.image}
						className="size-6 text-xs"
					/>
				)}
				<time
					dateTime={issue.updatedAt}
					title={formatDateTime(issue.updatedAt)}
					className="text-muted-foreground text-xs whitespace-nowrap"
				>
					{formatRelativeTime(issue.updatedAt)}
				</time>
			</div>
		</>
	);

	if (selectionMode) {
		return (
			<div
				className={cn(
					"flex items-start gap-3 border-b px-4 py-3 active:bg-accent/40",
					isSelected && "bg-accent/40",
				)}
			>
				<Checkbox
					className="mt-1"
					aria-label={`${identifier} ${issue.title}`}
					checked={isSelected}
					disabled={frozen}
					onCheckedChange={(checked) => onToggle(issue.id, checked)}
				/>
				<button
					type="button"
					className="min-w-0 flex-1 text-left"
					aria-pressed={isSelected}
					disabled={frozen}
					onClick={() => onToggle(issue.id, !isSelected)}
				>
					{body}
				</button>
			</div>
		);
	}

	return (
		<Link
			to="/orgs/$orgId/projects/$projectId/$issueNumber"
			// Cross-project lists (My Issues) rely on the per-issue project.
			params={{
				orgId,
				projectId: issue.projectId,
				issueNumber: String(issue.number),
			}}
			className="block border-b px-4 py-3 active:bg-accent/40"
		>
			{body}
		</Link>
	);
}
