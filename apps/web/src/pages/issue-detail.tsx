import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { UpdateIssueInput } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Archive,
	ArchiveRestore,
	ArrowLeft,
	ChevronLeft,
	ChevronRight,
	CircleAlert,
	CornerUpLeft,
	Pencil,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MutationError } from "@/components/mutation-error";
import { NotFoundState } from "@/components/not-found-state";
import { UserAvatar } from "@/components/user-avatar";
import { useSession } from "@/features/auth/data";
import { IssueArchiveDialog } from "@/features/issues/components/issue-archive-dialog";
import { IssueDeleteDialog } from "@/features/issues/components/issue-delete-dialog";
import { IssueDescription } from "@/features/issues/components/issue-description";
import { IssuePropertiesPanel } from "@/features/issues/components/issue-properties-panel";
import { IssuePropertiesSheet } from "@/features/issues/components/issue-properties-sheet";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { SubIssuesSection } from "@/features/issues/components/sub-issues-section";
import {
	issueArchiveAction,
	issueQuery,
	useDeleteIssue,
	useSetIssueArchived,
	useUpdateIssue,
} from "@/features/issues/data";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery } from "@/features/members/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { projectQuery } from "@/features/projects/data";
import {
	webIssueDetailSections,
	webIssueExtras,
	webIssueHeaderActions,
} from "@/features/registry";
import { useRecordRecentIssue } from "@/features/search/data";
import { statusesQuery } from "@/features/statuses/data";
import type { IssueCycleOption } from "@/features/web-types";
import { apiErrorMessage, isNotFoundError } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

const NO_CYCLES: IssueCycleOption[] = [];

function useNoCycles(): IssueCycleOption[] {
	return NO_CYCLES;
}

export function IssueDetailPage({
	orgId,
	projectId,
	issueNumber,
}: {
	orgId: string;
	projectId: string;
	issueNumber: number;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const issue = useQuery(issueQuery(orgId, projectId, issueNumber));
	const project = useQuery(projectQuery(orgId, projectId));
	useDocumentTitle(
		project.data?.key ? `${project.data.key}-${issueNumber}` : undefined,
	);
	const members = useQuery(membersQuery(orgId));
	const labels = useQuery(labelsQuery(orgId));
	const statuses = useQuery(statusesQuery(orgId));
	const useCycles = webIssueExtras().useCycles ?? useNoCycles;
	const cycles = useCycles(orgId, projectId);
	const frozen = useOrgFrozen(orgId);
	const { data: session } = useSession();

	useRecordRecentIssue(
		orgId,
		session?.user.id,
		issue.data && project.data
			? {
					projectId,
					issueNumber: issue.data.number,
					identifier: `${project.data.key}-${issue.data.number}`,
					title: issue.data.title,
				}
			: null,
	);

	const [title, setTitle] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [archiveOpen, setArchiveOpen] = useState(false);
	const [propertiesOpen, setPropertiesOpen] = useState(false);

	useEffect(() => {
		setTitle(issue.data?.title ?? "");
	}, [issue.data?.title]);

	const updateMutation = useUpdateIssue(orgId, projectId, issueNumber);
	const deleteMutation = useDeleteIssue(orgId, projectId, issueNumber);
	const archiveMutation = useSetIssueArchived(orgId, projectId, issueNumber);

	const setArchived = (archived: boolean) => {
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
	const remove = () =>
		deleteMutation.mutate(undefined, {
			onSuccess: () => {
				toast.success(t("toast.issueDeleted"));
				navigate({
					to: "/orgs/$orgId/projects/$projectId",
					params: { orgId, projectId },
					search: { page: 1, sort: "updated" },
				});
			},
		});

	const update = (input: UpdateIssueInput) => updateMutation.mutate(input);

	const navigateToIssue = (number: number | null) => {
		if (number === null) {
			return;
		}
		navigate({
			to: "/orgs/$orgId/projects/$projectId/$issueNumber",
			params: { orgId, projectId, issueNumber: String(number) },
		});
	};

	const commitTitle = () => {
		const next = title.trim();
		if (!next || !issue.data || next === issue.data.title) {
			setTitle(issue.data?.title ?? "");
			return;
		}
		update({ title: next });
	};

	if (issue.isPending) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<Spinner className="text-muted-foreground size-6" />
			</div>
		);
	}

	if (issue.isError && isNotFoundError(issue.error)) {
		return (
			<NotFoundState
				title={t("issues.notFoundTitle")}
				action={
					<Link
						to="/orgs/$orgId/projects/$projectId"
						params={{ orgId, projectId }}
						search={{ page: 1, sort: "updated" }}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<ArrowLeft className="size-4" />
						{t("issues.backToProject")}
					</Link>
				}
			/>
		);
	}

	if (issue.isError || !issue.data) {
		return (
			<div className="px-4 py-8 lg:px-6">
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{issue.error?.message ?? t("common.failedToLoad")}
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	const data = issue.data;
	const assignee = data.assigneeId
		? (members.data ?? []).find((member) => member.userId === data.assigneeId)
		: undefined;

	const issueDetailContext = {
		orgId,
		projectId,
		issueNumber: data.number,
		issueId: data.id,
		projectKey: project.data?.key ?? "",
		frozen,
		archivedAt: data.archivedAt,
	};

	return (
		<div className="flex flex-col gap-8 px-4 py-8 lg:flex-row lg:px-6">
			<div className="min-w-0 flex-1">
				<Breadcrumb className="mb-4">
					<BreadcrumbList>
						<BreadcrumbItem className="min-w-0">
							<BreadcrumbLink
								render={
									<Link
										to="/orgs/$orgId/projects/$projectId"
										params={{ orgId, projectId }}
										search={{ page: 1, sort: "updated" }}
										className="inline-flex min-w-0 items-center gap-1"
									/>
								}
							>
								<ArrowLeft className="size-4 shrink-0" />
								<span className="truncate">
									{project.data?.name ?? projectId}
								</span>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage className="shrink-0 font-mono text-xs">
								{project.data?.key}-{data.number}
							</BreadcrumbPage>
						</BreadcrumbItem>
						<BreadcrumbItem className="ml-auto">
							{webIssueHeaderActions().map(({ id, component: Action }) => (
								<Action key={id} {...issueDetailContext} />
							))}
							<Button
								variant="ghost"
								size="icon-sm"
								className="size-7 max-md:size-9"
								disabled={data.prevNumber === null}
								aria-label={t("issues.prevIssue")}
								onClick={() => navigateToIssue(data.prevNumber)}
							>
								<ChevronLeft />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								className="size-7 max-md:size-9"
								disabled={data.nextNumber === null}
								aria-label={t("issues.nextIssue")}
								onClick={() => navigateToIssue(data.nextNumber)}
							>
								<ChevronRight />
							</Button>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				{data.archivedAt ? (
					<Alert className="mb-4">
						<Archive />
						<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
							<span>{t("issues.archivedNotice")}</span>
							<Button
								variant="outline"
								size="sm"
								disabled={frozen || archiveMutation.isPending}
								onClick={() => setArchived(false)}
							>
								<ArchiveRestore />
								{t("issues.restoreAction")}
							</Button>
						</AlertDescription>
					</Alert>
				) : null}
				{data.parent ? (
					<Link
						to="/orgs/$orgId/projects/$projectId/$issueNumber"
						params={{
							orgId,
							projectId,
							issueNumber: String(data.parent.number),
						}}
						className={buttonVariants({
							variant: "link",
							size: "sm",
							className: "mb-2 h-auto justify-start p-0",
						})}
					>
						<CornerUpLeft className="size-4" />
						{t("issues.backToParent")} {project.data?.key}-{data.parent.number}
					</Link>
				) : null}
				<div className="group/title relative mt-1">
					{/* Input is used only for its shared focus/disabled semantics; its
					    default box (height, border, padding, dark fill) is reset so the
					    title stays a borderless transparent 2xl heading. */}
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onBlur={commitTitle}
						readOnly={frozen}
						aria-disabled={frozen}
						aria-label={t("issues.titleLabel")}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.currentTarget.blur();
							}
						}}
						className="h-auto rounded-md border-0 bg-transparent px-0 py-0 pr-8 text-2xl font-semibold tracking-tight transition-none hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50 md:text-2xl dark:bg-transparent"
						maxLength={500}
					/>
					<Pencil className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 opacity-50 transition-opacity md:opacity-0 md:group-hover/title:opacity-50 md:group-focus-within/title:opacity-50" />
				</div>
				<p className="text-muted-foreground mt-2 text-xs">
					{t("issues.created")}{" "}
					<time
						dateTime={data.createdAt}
						title={formatDateTime(data.createdAt)}
					>
						{formatRelativeTime(data.createdAt)}
					</time>{" "}
					· {t("issues.updated")}{" "}
					<time
						dateTime={data.updatedAt}
						title={formatDateTime(data.updatedAt)}
					>
						{formatRelativeTime(data.updatedAt)}
					</time>
				</p>

				{/* Mobile (<lg) properties summary: taps open the bottom sheet
				    that hosts the full properties panel. */}
				<div className="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
					<Button
						variant="outline"
						size="sm"
						className="max-md:h-9"
						aria-label={t("issues.status")}
						onClick={() => setPropertiesOpen(true)}
					>
						<StatusBadge status={data.status} />
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="max-md:h-9"
						aria-label={t("issues.priority")}
						onClick={() => setPropertiesOpen(true)}
					>
						<PriorityBadge value={data.priority} />
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="max-md:h-9"
						aria-label={t("issues.assignee")}
						onClick={() => setPropertiesOpen(true)}
					>
						{assignee ? (
							<>
								<UserAvatar
									name={assignee.user.name}
									image={assignee.user.image}
								/>
								<span className="text-xs">{assignee.user.name}</span>
							</>
						) : (
							<span className="text-muted-foreground text-xs">
								{t("common.unassigned")}
							</span>
						)}
					</Button>
				</div>

				<div className="mt-6">
					<IssueDescription
						description={issue.data?.description ?? null}
						disabled={frozen}
						onSave={async (description) => {
							try {
								await updateMutation.mutateAsync({ description });
								return true;
							} catch {
								return false;
							}
						}}
					/>
				</div>

				<Separator className="my-8" />

				<div className="flex flex-col gap-8">
					<SubIssuesSection
						orgId={orgId}
						projectId={projectId}
						projectKey={project.data?.key ?? ""}
						issueId={data.id}
						isSubIssue={data.parentId !== null}
						subIssues={data.subIssues}
						progress={data.subIssueProgress}
						frozen={frozen}
						members={members.data ?? []}
						labels={labels.data ?? []}
						statuses={statuses.data ?? []}
					/>
					{webIssueDetailSections().map(({ id, component: Section }) => (
						<Fragment key={id}>
							<Separator />
							<Section {...issueDetailContext} />
						</Fragment>
					))}
				</div>
			</div>

			{/* Desktop aside: hidden below lg, where the properties sheet in the
		    main column takes over. The dialogs below stay mounted (portals). */}
			<aside className="hidden w-full shrink-0 flex-col gap-4 lg:flex lg:w-64">
				<IssuePropertiesPanel
					orgId={orgId}
					projectId={projectId}
					projectKey={project.data?.key ?? ""}
					issue={data}
					parent={data.parent}
					canSetParent={data.subIssues.length === 0}
					members={members.data ?? []}
					labels={labels.data ?? []}
					statuses={statuses.data ?? []}
					cycles={cycles}
					frozen={frozen}
					onUpdate={update}
					onArchive={() =>
						issueArchiveAction(data) === "restore"
							? setArchived(false)
							: setArchiveOpen(true)
					}
					onDelete={() => setDeleteOpen(true)}
				/>
				<IssueArchiveDialog
					open={archiveOpen}
					onOpenChange={setArchiveOpen}
					issueKey={`${project.data?.key ?? ""}-${data.number}`}
					pending={archiveMutation.isPending}
					onConfirm={() => setArchived(true)}
				/>
				<IssueDeleteDialog
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					issueKey={`${project.data?.key ?? ""}-${data.number}`}
					pending={deleteMutation.isPending}
					onConfirm={remove}
				/>
				{deleteMutation.isError && (
					<MutationError error={deleteMutation.error} />
				)}

				{updateMutation.isError && (
					<MutationError error={updateMutation.error} />
				)}
			</aside>

			{/* Mobile (<lg) properties editor hosting the same panel as the
			    aside; error surfaces from the aside are hidden below lg, so
			    they are repeated here. */}
			<IssuePropertiesSheet
				open={propertiesOpen}
				onOpenChange={setPropertiesOpen}
				orgId={orgId}
				projectId={projectId}
				projectKey={project.data?.key ?? ""}
				issue={data}
				parent={data.parent}
				canSetParent={data.subIssues.length === 0}
				members={members.data ?? []}
				labels={labels.data ?? []}
				statuses={statuses.data ?? []}
				cycles={cycles}
				frozen={frozen}
				onUpdate={update}
				onArchive={() =>
					issueArchiveAction(data) === "restore"
						? setArchived(false)
						: setArchiveOpen(true)
				}
				onDelete={() => setDeleteOpen(true)}
				footer={
					<>
						{deleteMutation.isError && (
							<MutationError error={deleteMutation.error} />
						)}
						{updateMutation.isError && (
							<MutationError error={updateMutation.error} />
						)}
					</>
				}
			/>
		</div>
	);
}
