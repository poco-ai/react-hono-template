import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { UpdateIssueInput } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import {
	ArrowLeft,
	ChevronLeft,
	ChevronRight,
	CircleAlert,
	Loader2,
	Pencil,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { NotFoundState } from "@/components/not-found-state";
import { IssueActivityTimeline } from "@/features/issues/components/issue-activity";
import { IssueAttachments } from "@/features/issues/components/issue-attachments";
import { IssueComments } from "@/features/issues/components/issue-comments";
import { IssueDeleteDialog } from "@/features/issues/components/issue-delete-dialog";
import { IssueDescription } from "@/features/issues/components/issue-description";
import { IssuePropertiesPanel } from "@/features/issues/components/issue-properties-panel";
import {
	issueQuery,
	useDeleteIssue,
	useUpdateIssue,
} from "@/features/issues/data";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery } from "@/features/members/data";
import { projectQuery } from "@/features/projects/data";
import { apiErrorMessage, isNotFoundError } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/issue-utils";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useOrgFrozen } from "@/lib/use-org-frozen";

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
	const frozen = useOrgFrozen(orgId);

	const [title, setTitle] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);

	useEffect(() => {
		setTitle(issue.data?.title ?? "");
	}, [issue.data?.title]);

	const updateMutation = useUpdateIssue(orgId, projectId, issueNumber);
	const deleteMutation = useDeleteIssue(orgId, projectId, issueNumber);
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
				<Loader2 className="text-muted-foreground size-6 animate-spin" />
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

	return (
		<div className="flex flex-col gap-8 px-4 py-8 lg:flex-row lg:px-6">
			<div className="min-w-0 flex-1">
				<nav className="mb-4 flex items-center gap-1.5 text-sm">
					<Link
						to="/orgs/$orgId/projects/$projectId"
						params={{ orgId, projectId }}
						search={{ page: 1, sort: "updated" }}
						className="text-muted-foreground hover:text-foreground inline-flex min-w-0 items-center gap-1"
					>
						<ArrowLeft className="size-4 shrink-0" />
						<span className="truncate">{project.data?.name ?? projectId}</span>
					</Link>
					<span className="text-muted-foreground/50">/</span>
					<span className="text-foreground shrink-0 font-mono text-xs">
						{project.data?.key}-{data.number}
					</span>
					<div className="flex shrink-0 items-center">
						<Button
							variant="ghost"
							size="icon-sm"
							className="size-7"
							disabled={data.prevNumber === null}
							aria-label={t("issues.prevIssue")}
							onClick={() => navigateToIssue(data.prevNumber)}
						>
							<ChevronLeft />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							className="size-7"
							disabled={data.nextNumber === null}
							aria-label={t("issues.nextIssue")}
							onClick={() => navigateToIssue(data.nextNumber)}
						>
							<ChevronRight />
						</Button>
					</div>
				</nav>
				<div className="group/title relative mt-1">
					<input
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
						className="w-full rounded-md border-none bg-transparent pr-8 text-2xl font-semibold tracking-tight outline-none hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50"
						maxLength={500}
					/>
					<Pencil className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 opacity-0 transition-opacity group-hover/title:opacity-50 group-focus-within/title:opacity-50" />
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
					<IssueComments
						orgId={orgId}
						projectId={projectId}
						issueNumber={issueNumber}
						frozen={frozen}
					/>
					<Separator />
					<IssueAttachments
						orgId={orgId}
						projectId={projectId}
						issueNumber={issueNumber}
						frozen={frozen}
					/>
					<Separator />
					<IssueActivityTimeline
						orgId={orgId}
						projectId={projectId}
						issueNumber={issueNumber}
						members={members.data ?? []}
						labels={labels.data ?? []}
					/>
				</div>
			</div>

			<aside className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
				<IssuePropertiesPanel
					issue={data}
					members={members.data ?? []}
					labels={labels.data ?? []}
					frozen={frozen}
					onUpdate={update}
					onDelete={() => setDeleteOpen(true)}
				/>
				<IssueDeleteDialog
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					issueKey={`${project.data?.key ?? ""}-${data.number}`}
					pending={deleteMutation.isPending}
					onConfirm={remove}
				/>
				{deleteMutation.isError && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>
							{apiErrorMessage(t, deleteMutation.error)}
						</AlertDescription>
					</Alert>
				)}

				{updateMutation.isError && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>
							{apiErrorMessage(t, updateMutation.error)}
						</AlertDescription>
					</Alert>
				)}
			</aside>
		</div>
	);
}
