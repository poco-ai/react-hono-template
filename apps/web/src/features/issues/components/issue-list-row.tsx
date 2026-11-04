import type { IssueDetailDto } from "@api/dto/issue.dto";
import type { LabelDto } from "@api/dto/label.dto";
import type { StatusDto } from "@api/dto/status.dto";
import { Link, useNavigate } from "@tanstack/react-router";
import { ISSUE_PRIORITIES, type UpdateIssueInput } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { TableCell, TableRow } from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import {
	Archive,
	ArchiveRestore,
	Copy,
	ExternalLink,
	MoreHorizontal,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserAvatar } from "@/components/user-avatar";
import { LabelBadge } from "@/features/labels/components/label-badge";
import type { OrgMember } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import {
	formatDate,
	formatDateTime,
	formatRelativeTime,
	fromDateInputValue,
	toDateInputValue,
} from "@/lib/format";
import type { IssueFilters } from "../data";
import {
	issueArchiveAction,
	useIssueFieldUpdate,
	useSetIssueArchived,
} from "../data";
import {
	type IssueListColumn,
	type IssueListDensity,
	LIST_DENSITY_ROW_CLASS,
} from "../list-preferences";
import { DateField } from "./date-field";
import { IssueArchiveDialog } from "./issue-archive-dialog";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";

/** Responsive visibility and width for each optional column. */
export const ISSUE_COLUMN_CLASS: Record<IssueListColumn, string> = {
	status: "w-28",
	priority: "w-24",
	assignee: "w-28",
	labels: "hidden w-40 md:table-cell",
	dueDate: "hidden w-28 md:table-cell",
	createdAt: "hidden w-28 lg:table-cell",
	updatedAt: "w-28",
	estimate: "hidden w-20 sm:table-cell",
};

export function IssueListRow({
	orgId,
	projectId,
	projectKey,
	issue,
	columns,
	density,
	filters,
	selected,
	frozen,
	statuses,
	members,
	memberById,
	labelById,
	onToggle,
	onRequestDelete,
}: {
	orgId: string;
	projectId: string;
	projectKey: string;
	issue: IssueDetailDto;
	columns: readonly IssueListColumn[];
	density: IssueListDensity;
	filters: IssueFilters;
	selected: boolean;
	frozen: boolean;
	statuses: StatusDto[];
	members: OrgMember[];
	memberById: Map<string, OrgMember>;
	labelById: Map<string, LabelDto>;
	onToggle: (id: string, checked: boolean) => void;
	onRequestDelete: (issue: IssueDetailDto) => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const update = useIssueFieldUpdate(orgId, projectId, filters);
	const archiveMutation = useSetIssueArchived(orgId, projectId, issue.number);
	const [archiveOpen, setArchiveOpen] = useState(false);
	const archiveAction = issueArchiveAction(issue);
	const issueKey = `${projectKey}-${issue.number}`;
	const assignee = issue.assigneeId
		? memberById.get(issue.assigneeId)
		: undefined;
	const params = {
		orgId,
		projectId,
		issueNumber: String(issue.number),
	};

	const commit = (input: UpdateIssueInput) => {
		if (frozen) {
			return;
		}
		update.mutate(
			{ id: issue.id, number: issue.number, input },
			{ onError: (error) => toast.error(apiErrorMessage(t, error)) },
		);
	};

	const copyLink = () => {
		const url = `${window.location.origin}/orgs/${orgId}/projects/${projectId}/${issue.number}`;
		navigator.clipboard
			?.writeText(url)
			.then(() => toast.success(t("common.copied")))
			.catch(() => toast.error(t("common.copyFailed")));
	};

	const setArchived = (archived: boolean) => {
		if (frozen) {
			return;
		}
		archiveMutation.mutate(archived, {
			onSuccess: () => {
				toast.success(
					t(archived ? "toast.issueArchived" : "toast.issueRestored"),
				);
				setArchiveOpen(false);
			},
			onError: (error) => {
				toast.error(apiErrorMessage(t, error));
				setArchiveOpen(false);
			},
		});
	};

	const renderCell = (column: IssueListColumn) => {
		switch (column) {
			case "status":
				return (
					<DropdownMenu key={column}>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="sm"
									className="-mx-1 h-7 justify-start px-1"
									disabled={frozen}
									aria-label={t("issues.status")}
								>
									<StatusBadge status={issue.status} />
								</Button>
							}
						/>
						<DropdownMenuContent align="start">
							<DropdownMenuLabel>{t("issues.status")}</DropdownMenuLabel>
							{statuses.map((status) => (
								<DropdownMenuItem
									key={status.id}
									disabled={status.id === issue.statusId}
									onClick={() => commit({ statusId: status.id })}
								>
									<StatusBadge status={status} />
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			case "priority":
				return (
					<DropdownMenu key={column}>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="sm"
									className="-mx-1 h-7 justify-start px-1"
									disabled={frozen}
									aria-label={t("issues.priority")}
								>
									<PriorityBadge value={issue.priority} />
								</Button>
							}
						/>
						<DropdownMenuContent align="start">
							<DropdownMenuLabel>{t("issues.priority")}</DropdownMenuLabel>
							{ISSUE_PRIORITIES.map(({ value }) => (
								<DropdownMenuItem
									key={value}
									disabled={value === issue.priority}
									onClick={() => commit({ priority: value })}
								>
									<PriorityBadge value={value} />
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			case "assignee":
				return (
					<DropdownMenu key={column}>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="sm"
									className="-mx-1 h-7 justify-start gap-1.5 px-1"
									disabled={frozen}
									aria-label={t("issues.assignee")}
								>
									{assignee ? (
										<>
											<UserAvatar
												name={assignee.user.name}
												image={assignee.user.image}
											/>
											<span className="max-w-20 truncate text-xs">
												{assignee.user.name}
											</span>
										</>
									) : (
										<span className="text-muted-foreground text-xs">
											{t("common.unassigned")}
										</span>
									)}
								</Button>
							}
						/>
						<DropdownMenuContent align="start" className="min-w-44">
							<DropdownMenuLabel>{t("issues.assignee")}</DropdownMenuLabel>
							<DropdownMenuItem
								disabled={issue.assigneeId === null}
								onClick={() => commit({ assigneeId: null })}
							>
								{t("common.unassigned")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{members.map((member) => (
								<DropdownMenuItem
									key={member.userId}
									disabled={member.userId === issue.assigneeId}
									onClick={() => commit({ assigneeId: member.userId })}
								>
									<UserAvatar
										name={member.user.name}
										image={member.user.image}
									/>
									<span className="truncate">{member.user.name}</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			case "labels":
				return issue.labelIds.length > 0 ? (
					<span key={column} className="flex flex-wrap gap-1">
						{issue.labelIds.map((labelId) => {
							const label = labelById.get(labelId);
							return label ? <LabelBadge key={labelId} label={label} /> : null;
						})}
					</span>
				) : (
					<span key={column} className="text-muted-foreground/50">
						—
					</span>
				);
			case "dueDate":
				return (
					<DateField
						key={column}
						value={toDateInputValue(issue.dueDate)}
						disabled={frozen}
						className="h-7 w-auto border-transparent bg-transparent px-1 font-normal text-xs shadow-none hover:bg-accent"
						onChange={(value) =>
							commit({ dueDate: value ? fromDateInputValue(value) : null })
						}
					/>
				);
			case "createdAt":
				return (
					<span
						key={column}
						title={formatDateTime(issue.createdAt)}
						className="text-muted-foreground text-xs whitespace-nowrap"
					>
						{formatDate(issue.createdAt)}
					</span>
				);
			case "updatedAt":
				return (
					<span
						key={column}
						title={formatDateTime(issue.updatedAt)}
						className="text-muted-foreground text-xs whitespace-nowrap"
					>
						{formatRelativeTime(issue.updatedAt)}
					</span>
				);
			case "estimate":
				return (
					<span key={column} className="text-muted-foreground text-xs">
						{issue.estimate ?? "—"}
					</span>
				);
		}
	};

	return (
		<>
			<TableRow
				className={cn(
					"group cursor-pointer hover:bg-accent/40",
					selected && "bg-accent/40",
					LIST_DENSITY_ROW_CLASS[density],
				)}
				onClick={() =>
					navigate({
						to: "/orgs/$orgId/projects/$projectId/$issueNumber",
						params,
					})
				}
			>
				<TableCell
					className="hidden md:table-cell"
					onClick={(event) => event.stopPropagation()}
				>
					<Checkbox
						aria-label={issue.title}
						checked={selected}
						disabled={frozen}
						onCheckedChange={(checked) => onToggle(issue.id, checked)}
					/>
				</TableCell>
				<TableCell className="text-muted-foreground font-mono text-xs">
					{projectKey}-{issue.number}
				</TableCell>
				<TableCell>
					<span className="inline-flex min-w-0 items-center gap-2">
						<Link
							to="/orgs/$orgId/projects/$projectId/$issueNumber"
							params={params}
							className="truncate hover:underline"
						>
							{issue.title}
						</Link>
						{issue.archivedAt ? (
							<Badge variant="secondary" className="shrink-0 rounded-md">
								{t("issues.archivedBadge")}
							</Badge>
						) : null}
					</span>
				</TableCell>
				{columns.map((column) => (
					<TableCell
						key={column}
						className={ISSUE_COLUMN_CLASS[column]}
						// Inline editors live inside the row link: keep row-clicks from
						// navigating while a cell control handles the interaction.
						onClick={(event) => event.stopPropagation()}
						title={
							column === "updatedAt"
								? formatDateTime(issue.updatedAt)
								: column === "createdAt"
									? formatDateTime(issue.createdAt)
									: undefined
						}
					>
						{renderCell(column)}
					</TableCell>
				))}
				<TableCell
					className="w-10 text-right"
					onClick={(event) => event.stopPropagation()}
				>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={t("issues.rowActions")}
									className={cn(
										"opacity-100 transition-opacity",
										"[@media(hover:hover)]:opacity-0",
										"[@media(hover:hover)]:group-hover:opacity-100",
										"group-focus-within:opacity-100 focus-visible:opacity-100",
									)}
								>
									<MoreHorizontal />
								</Button>
							}
						/>
						<DropdownMenuContent align="end" className="min-w-44">
							<DropdownMenuLabel>
								{projectKey}-{issue.number}
							</DropdownMenuLabel>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger disabled={frozen}>
									{t("bulk.changeStatus")}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{statuses.map((status) => (
										<DropdownMenuItem
											key={status.id}
											disabled={status.id === issue.statusId}
											onClick={() => commit({ statusId: status.id })}
										>
											<StatusBadge status={status} />
										</DropdownMenuItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger disabled={frozen}>
									{t("bulk.changeAssignee")}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									<DropdownMenuItem
										disabled={issue.assigneeId === null}
										onClick={() => commit({ assigneeId: null })}
									>
										{t("common.unassigned")}
									</DropdownMenuItem>
									{members.map((member) => (
										<DropdownMenuItem
											key={member.userId}
											disabled={member.userId === issue.assigneeId}
											onClick={() => commit({ assigneeId: member.userId })}
										>
											<UserAvatar
												name={member.user.name}
												image={member.user.image}
											/>
											<span className="truncate">{member.user.name}</span>
										</DropdownMenuItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={copyLink}>
								<Copy />
								{t("issues.copyLink")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									navigate({
										to: "/orgs/$orgId/projects/$projectId/$issueNumber",
										params,
									})
								}
							>
								<ExternalLink />
								{t("issues.openDetail")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={frozen}
								onClick={() =>
									archiveAction === "restore"
										? setArchived(false)
										: setArchiveOpen(true)
								}
							>
								{archiveAction === "archive" ? <Archive /> : <ArchiveRestore />}
								{archiveAction === "archive"
									? t("issues.archiveAction")
									: t("issues.restoreAction")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								disabled={frozen}
								onClick={() => onRequestDelete(issue)}
							>
								<Trash2 />
								{t("issues.deleteAction")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</TableCell>
			</TableRow>
			<IssueArchiveDialog
				open={archiveOpen}
				onOpenChange={setArchiveOpen}
				issueKey={issueKey}
				pending={archiveMutation.isPending}
				onConfirm={() => setArchived(true)}
			/>
		</>
	);
}
