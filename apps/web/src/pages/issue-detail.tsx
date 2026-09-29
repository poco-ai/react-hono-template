import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
	type UpdateIssueInput,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { ArrowLeft, CircleAlert, Loader2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IssueActivityTimeline } from "@/components/issue/issue-activity";
import { IssueAttachments } from "@/components/issue/issue-attachments";
import { IssueComments } from "@/components/issue/issue-comments";
import { IssueDescription } from "@/components/issue/issue-description";
import { LabelBadge } from "@/components/issue/label-badge";
import { PriorityBadge } from "@/components/issue/priority-badge";
import { StatusBadge } from "@/components/issue/status-badge";
import { MultiSelect } from "@/components/multi-select";
import { NotFoundState } from "@/components/not-found-state";
import { client, unwrap } from "@/lib/api";
import { isNotFoundError } from "@/lib/errors";
import {
	formatDateTime,
	formatRelativeTime,
	fromDateInputValue,
	priorityName,
	priorityValue,
	toDateInputValue,
} from "@/lib/issue-utils";
import {
	issueActivitiesKey,
	orgActivitiesRootKey,
} from "@/lib/queries/activities";
import { issueQuery } from "@/lib/queries/issues";
import { labelsQuery } from "@/lib/queries/labels";
import { membersQuery } from "@/lib/queries/members";
import { projectQuery } from "@/lib/queries/projects";

const PRIORITY_NAMES = ISSUE_PRIORITIES.map((p) => p.name);
const UNASSIGNED = "__unassigned__";

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
	const queryClient = useQueryClient();
	const issue = useQuery(issueQuery(orgId, projectId, issueNumber));
	const project = useQuery(projectQuery(orgId, projectId));
	const members = useQuery(membersQuery(orgId));
	const labels = useQuery(labelsQuery(orgId));

	const [title, setTitle] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [estimateDraft, setEstimateDraft] = useState("");

	useEffect(() => {
		setTitle(issue.data?.title ?? "");
	}, [issue.data?.title]);

	useEffect(() => {
		setEstimateDraft(
			issue.data?.estimate === null || issue.data?.estimate === undefined
				? ""
				: String(issue.data.estimate),
		);
	}, [issue.data?.estimate]);

	const detailKey = issueQuery(orgId, projectId, issueNumber).queryKey;

	const updateMutation = useMutation({
		mutationFn: (input: UpdateIssueInput) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].$patch({
					param: { orgId, projectId, number: String(issueNumber) },
					json: input,
				}),
			),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: detailKey });
			const previous = queryClient.getQueryData(detailKey);
			queryClient.setQueryData(detailKey, (old) => {
				if (!old) {
					return old;
				}
				const next = { ...old };
				if (input.title !== undefined) {
					next.title = input.title;
				}
				if (input.description !== undefined) {
					next.description = input.description;
				}
				if (input.status !== undefined) {
					next.status = input.status;
				}
				if (input.priority !== undefined) {
					next.priority = input.priority ?? 0;
				}
				if (input.assigneeId !== undefined) {
					next.assigneeId = input.assigneeId;
				}
				if (input.dueDate !== undefined) {
					next.dueDate = input.dueDate;
				}
				if (input.estimate !== undefined) {
					next.estimate = input.estimate;
				}
				if (input.labelIds !== undefined) {
					next.labelIds = input.labelIds;
				}
				return next;
			});
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				queryClient.setQueryData(detailKey, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: detailKey });
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "issues"] });
			queryClient.invalidateQueries({
				queryKey: orgActivitiesRootKey(orgId),
			});
			queryClient.invalidateQueries({
				queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
			});
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].$delete({ param: { orgId, projectId, number: String(issueNumber) } }),
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "issues"] });
			queryClient.invalidateQueries({
				queryKey: orgActivitiesRootKey(orgId),
			});
			navigate({
				to: "/orgs/$orgId/projects/$projectId",
				params: { orgId, projectId },
				search: { page: 1, sort: "updated" },
			});
		},
	});

	const update = (input: UpdateIssueInput) => updateMutation.mutate(input);

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
			<div className="p-8">
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
	const memberById = new Map(
		(members.data ?? []).map((member) => [member.userId, member]),
	);
	const assigneeLabel = data.assigneeId
		? (memberById.get(data.assigneeId)?.user.name ?? t("common.unassigned"))
		: t("common.unassigned");

	return (
		<div className="mx-auto flex max-w-5xl gap-8 p-8">
			<div className="min-w-0 flex-1">
				<Link
					to="/orgs/$orgId/projects/$projectId"
					params={{ orgId, projectId }}
					search={{ page: 1, sort: "updated" }}
					className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
				>
					<ArrowLeft className="size-4" />
					{t("issues.backToProject")}
				</Link>
				<p className="text-muted-foreground font-mono text-xs">
					{project.data?.key}-{data.number}
				</p>
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					onBlur={commitTitle}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.currentTarget.blur();
						}
					}}
					className="mt-1 w-full rounded-md border-none bg-transparent text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					maxLength={500}
				/>
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
					/>
					<Separator />
					<IssueAttachments
						orgId={orgId}
						projectId={projectId}
						issueNumber={issueNumber}
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

			<aside className="flex w-64 shrink-0 flex-col gap-4">
				<PropertyRow label={t("issues.status")}>
					<Select
						value={data.status as IssueStatus}
						onValueChange={(v) =>
							v && update({ status: v as (typeof ISSUE_STATUSES)[number] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue>
								{t(`issues.statuses.${data.status as IssueStatus}`)}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{ISSUE_STATUSES.map((status) => (
								<SelectItem key={status} value={status}>
									<StatusBadge status={status} />
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyRow>

				<PropertyRow label={t("issues.priority")}>
					<Select
						value={priorityName(data.priority)}
						onValueChange={(v) =>
							v &&
							update({
								priority: priorityValue(v as IssuePriorityName),
							})
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue>
								{t(`issues.priorities.${priorityName(data.priority)}`)}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{PRIORITY_NAMES.map((name) => (
								<SelectItem key={name} value={name}>
									<PriorityBadge value={priorityValue(name)} />
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyRow>

				<PropertyRow label={t("issues.assignee")}>
					<Select
						value={data.assigneeId ?? UNASSIGNED}
						onValueChange={(v) =>
							update({ assigneeId: v === UNASSIGNED ? null : v })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue>{assigneeLabel}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={UNASSIGNED}>
								{t("common.unassigned")}
							</SelectItem>
							{(members.data ?? []).map((member) => (
								<SelectItem key={member.userId} value={member.userId}>
									{member.user.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyRow>

				<PropertyRow label={t("issues.labels")}>
					<MultiSelect
						className="w-full justify-between"
						placeholder={t("issues.noLabels")}
						value={data.labelIds}
						options={(labels.data ?? []).map((label) => ({
							value: label.id,
							label: label.name,
						}))}
						onChange={(next) => update({ labelIds: next })}
					/>
					{data.labelIds.length > 0 && (
						<span className="mt-2 flex flex-wrap gap-1">
							{data.labelIds.map((labelId) => {
								const label = labels.data?.find((l) => l.id === labelId);
								return label ? (
									<LabelBadge key={labelId} label={label} />
								) : null;
							})}
						</span>
					)}
				</PropertyRow>

				<PropertyRow label={t("issues.dueDate")}>
					<Input
						type="date"
						value={toDateInputValue(data.dueDate)}
						onChange={(e) =>
							update({ dueDate: fromDateInputValue(e.target.value) })
						}
					/>
				</PropertyRow>

				<PropertyRow label={t("issues.estimate")}>
					<Input
						type="number"
						min={0}
						max={100}
						value={estimateDraft}
						onChange={(e) => setEstimateDraft(e.target.value)}
						onBlur={() => {
							if (estimateDraft === "") {
								if (data.estimate !== null) {
									update({ estimate: null });
								}
								return;
							}
							const parsed = Number(estimateDraft);
							if (
								Number.isInteger(parsed) &&
								parsed >= 0 &&
								parsed <= 100 &&
								parsed !== data.estimate
							) {
								update({ estimate: parsed });
							} else {
								setEstimateDraft(
									data.estimate === null ? "" : String(data.estimate),
								);
							}
						}}
					/>
					<p className="text-muted-foreground text-xs">
						{t("issues.estimateUnit")}
					</p>
				</PropertyRow>

				<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
					<Button
						variant="outline"
						className="w-full text-destructive hover:text-destructive"
						onClick={() => setDeleteOpen(true)}
					>
						<Trash2 />
						{t("common.delete")}
					</Button>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("issues.deleteTitle")}</AlertDialogTitle>
							<AlertDialogDescription>
								{t("issues.deleteDescription", {
									key: `${project.data?.key ?? ""}-${data.number}`,
								})}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								disabled={deleteMutation.isPending}
								onClick={(e) => {
									e.preventDefault();
									deleteMutation.mutate();
								}}
							>
								{t("common.delete")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				{deleteMutation.isError && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>{deleteMutation.error.message}</AlertDescription>
					</Alert>
				)}

				{updateMutation.isError && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>{updateMutation.error.message}</AlertDescription>
					</Alert>
				)}
			</aside>
		</div>
	);
}

function PropertyRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-muted-foreground text-xs">{label}</Label>
			{children}
		</div>
	);
}
