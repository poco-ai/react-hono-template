import type { ListIssuesDto } from "@api/dto/issue.dto";
import type { LabelDto } from "@api/dto/label.dto";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { IssueStatus } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import { UserAvatar } from "@/components/user-avatar";
import { LabelBadge } from "@/features/issues/components/label-badge";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import type { OrgMember } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import {
	formatDateTime,
	formatDueDate,
	formatRelativeTime,
} from "@/lib/issue-utils";

export function IssueList({
	orgId,
	projectId,
	projectKey,
	issues,
	members,
	labels,
	page,
	selected,
	frozen,
	hasFilters,
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
	page: number;
	selected: Set<string>;
	frozen: boolean;
	hasFilters: boolean;
	toggleAllOnPage: (checked: boolean) => void;
	toggleOne: (id: string, checked: boolean) => void;
	onPageChange: (page: number) => void;
	onClearFilters: () => void;
	onNewIssue: () => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const result = issues.data;
	const listEmpty = !issues.isPending && result?.items.length === 0;
	const totalPages = result
		? Math.max(1, Math.ceil(result.total / result.pageSize))
		: 1;
	const memberById = new Map(members.map((member) => [member.userId, member]));
	const labelById = new Map(labels.map((label) => [label.id, label]));
	const allOnPageSelected =
		(result?.items.length ?? 0) > 0 &&
		result?.items.every((issue) => selected.has(issue.id));
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
								<TableHead className="w-28">{t("issues.status")}</TableHead>
								<TableHead className="w-28">{t("issues.priority")}</TableHead>
								<TableHead className="w-36">{t("issues.assignee")}</TableHead>
								<TableHead className="w-48">{t("issues.labels")}</TableHead>
								<TableHead className="w-28">{t("issues.dueDate")}</TableHead>
								<TableHead className="w-44">{t("issues.updated")}</TableHead>
							</TableRow>
						</TableHeader>
					)}
					<TableBody>
						{result?.items.map((issue) => {
							const assignee = issue.assigneeId
								? memberById.get(issue.assigneeId)
								: undefined;
							return (
								<TableRow
									key={issue.id}
									className={cn(
										"cursor-pointer hover:bg-accent/40",
										selected.has(issue.id) && "bg-accent/40",
									)}
									onClick={() =>
										navigate({
											to: "/orgs/$orgId/projects/$projectId/$issueNumber",
											params: {
												orgId,
												projectId,
												issueNumber: String(issue.number),
											},
										})
									}
								>
									<TableCell
										className="hidden md:table-cell"
										onClick={(e) => e.stopPropagation()}
									>
										<Checkbox
											aria-label={issue.title}
											checked={selected.has(issue.id)}
											disabled={frozen}
											onCheckedChange={(checked) =>
												toggleOne(issue.id, checked)
											}
										/>
									</TableCell>
									<TableCell className="text-muted-foreground font-mono text-xs">
										{projectKey}-{issue.number}
									</TableCell>
									<TableCell>
										<Link
											to="/orgs/$orgId/projects/$projectId/$issueNumber"
											params={{
												orgId,
												projectId,
												issueNumber: String(issue.number),
											}}
											className="hover:underline"
										>
											{issue.title}
										</Link>
									</TableCell>
									<TableCell>
										<StatusBadge status={issue.status as IssueStatus} />
									</TableCell>
									<TableCell>
										<PriorityBadge value={issue.priority} />
									</TableCell>
									<TableCell>
										{assignee ? (
											<span title={assignee.user.name} className="inline-flex">
												<UserAvatar name={assignee.user.name} />
											</span>
										) : (
											<span className="text-muted-foreground/50">—</span>
										)}
									</TableCell>
									<TableCell>
										{issue.labelIds.length > 0 ? (
											<span className="flex flex-wrap gap-1">
												{issue.labelIds.map((labelId) => {
													const label = labelById.get(labelId);
													return label ? (
														<LabelBadge key={labelId} label={label} />
													) : null;
												})}
											</span>
										) : (
											<span className="text-muted-foreground/50">—</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{formatDueDate(issue.dueDate) || (
											<span className="text-muted-foreground/50">—</span>
										)}
									</TableCell>
									<TableCell
										title={formatDateTime(issue.updatedAt)}
										className="text-muted-foreground text-xs"
									>
										{formatRelativeTime(issue.updatedAt)}
									</TableCell>
								</TableRow>
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
									<TableCell>
										<Skeleton className="h-5 w-20 rounded-md" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-5 w-16 rounded-full" />
									</TableCell>
									<TableCell>
										<Skeleton className="size-6 rounded-full" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-5 w-16 rounded-md" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-3.5 w-16" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-3.5 w-20" />
									</TableCell>
								</TableRow>
							))}
						{issues.isError && (
							<TableRow>
								<TableCell colSpan={9} className="text-center text-red-500">
									{apiErrorMessage(t, issues.error)}
								</TableCell>
							</TableRow>
						)}
						{listEmpty && (
							<TableRow>
								<TableCell colSpan={9} className="p-0">
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
				<span>{result ? t("issues.count", { count: result.total }) : ""}</span>
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
