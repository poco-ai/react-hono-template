import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemMedia,
} from "@workspace/ui/components/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CircleAlert, Filter, Inbox, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useSession } from "@/features/auth/data";
import { bulkPartialFailure } from "@/features/issues/data";
import { membersQuery } from "@/features/members/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { projectsQuery } from "@/features/projects/data";
import { statusesQuery } from "@/features/statuses/data";
import {
	resolveTriageProjectFilter,
	type TriageIssueDto,
	type TriageSearch,
	type TriageUpdate,
	triageActionInput,
	triageAvailability,
	triageQuery,
	useBulkTriageIssues,
	useTriageIssue,
} from "@/features/triage/data";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

const ALL_PROJECTS = "__all__";
const SKELETON_ROWS = ["triage-1", "triage-2", "triage-3"];

/**
 * Triage queue: every backlog issue without an owner. Members accept (assign
 * themselves + move to the first unstarted status), decline (move to a
 * canceled status) or open the issue; rows support multi-select bulk actions.
 */
export function TriagePage({
	orgId,
	search,
	onProjectChange,
}: {
	orgId: string;
	search: TriageSearch;
	onProjectChange: (projectId: string | undefined) => void;
}) {
	const { t, i18n } = useTranslation();
	useDocumentTitle(t("triage.title"));
	const navigate = useNavigate();
	const frozen = useOrgFrozen(orgId);
	const { data: session } = useSession();
	const projects = useQuery(projectsQuery(orgId));
	const members = useQuery(membersQuery(orgId));
	const statuses = useQuery(statusesQuery(orgId));

	const activeProjects = (projects.data ?? []).filter(
		(project) => !project.archived,
	);
	const projectId = projects.isSuccess
		? resolveTriageProjectFilter(search, activeProjects)
		: search.projectId;
	const triage = useQuery(triageQuery(orgId, projectId));
	const [selected, setSelected] = useState<Set<string>>(new Set());

	// The queue changed (filter or refetch): drop ids that may no longer exist.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
	useEffect(() => {
		setSelected(new Set());
	}, [projectId, triage.data]);

	const items = triage.data?.items ?? [];
	const memberNames = new Map(
		(members.data ?? []).map((member) => [member.userId, member.user.name]),
	);
	const dateFormat = new Intl.DateTimeFormat(i18n.language, {
		dateStyle: "medium",
	});
	const currentUserId = session?.user.id;

	const single = useTriageIssue(orgId, {
		onSuccess: (_data, variables) => {
			toast.success(
				t(
					variables.action === "accept"
						? "toast.triageAccepted"
						: "toast.triageDeclined",
				),
			);
		},
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});
	const bulk = useBulkTriageIssues(orgId, {
		onSuccess: (_data, variables) => {
			toast.success(t("toast.triageBulkUpdated", { count: variables.length }));
		},
		onError: (error) => {
			const partial = bulkPartialFailure(error);
			toast.error(
				partial
					? t("bulk.partialFailure", {
							failed: partial.failed,
							total: partial.total,
						})
					: apiErrorMessage(t, error),
			);
		},
	});

	const buildUpdate = (
		issue: TriageIssueDto,
		action: "accept" | "decline",
	): TriageUpdate | null => {
		if (!currentUserId) {
			return null;
		}
		const input = triageActionInput(action, {
			assigneeId: currentUserId,
			statuses: statuses.data,
		});
		if (!input) {
			toast.error(
				t(
					action === "accept"
						? "triage.missingUnstarted"
						: "triage.missingCanceled",
				),
			);
			return null;
		}
		return { issue, input, action };
	};

	const run = (issue: TriageIssueDto, action: "accept" | "decline") => {
		const update = buildUpdate(issue, action);
		if (update) {
			single.mutate(update);
		}
	};

	const runBulk = (action: "accept" | "decline") => {
		const updates = items
			.filter((issue) => selected.has(issue.id))
			.map((issue) => buildUpdate(issue, action))
			.filter((update): update is TriageUpdate => update !== null);
		if (updates.length > 0) {
			bulk.mutate(updates, {
				onSuccess: () => setSelected(new Set()),
			});
		}
	};

	const openIssue = (issue: TriageIssueDto) => {
		void navigate({
			to: "/orgs/$orgId/projects/$projectId/$issueNumber",
			params: {
				orgId,
				projectId: issue.projectId,
				issueNumber: String(issue.number),
			},
		});
	};

	const toggleOne = (id: string, checked: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	};

	const toggleAll = (checked: boolean) =>
		setSelected(checked ? new Set(items.map((issue) => issue.id)) : new Set());

	const busy = single.isPending || bulk.isPending;
	const availability = triageAvailability({
		frozen,
		busy,
		assigneeId: currentUserId,
	});

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col px-4 py-8 lg:px-6">
			<header>
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("triage.title")}
				</h1>
				<p className="text-muted-foreground mt-1 max-w-2xl text-sm">
					{t("triage.description")}
				</p>
				<p className="text-muted-foreground mt-2 max-w-2xl text-xs">
					{t("triage.rules")}
				</p>
			</header>

			<div className="mt-5 flex flex-wrap items-center gap-2">
				<Select
					value={projectId ?? ALL_PROJECTS}
					onValueChange={(value) =>
						onProjectChange(value && value !== ALL_PROJECTS ? value : undefined)
					}
				>
					<SelectTrigger className="w-56">
						<Filter className="size-4" />
						<SelectValue>
							{projectId
								? (activeProjects.find((project) => project.id === projectId)
										?.name ?? t("triage.allProjects"))
								: t("triage.allProjects")}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_PROJECTS}>
							{t("triage.allProjects")}
						</SelectItem>
						{activeProjects.map((project) => (
							<SelectItem key={project.id} value={project.id}>
								{project.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{projectId ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onProjectChange(undefined)}
					>
						<X />
						{t("triage.clearFilter")}
					</Button>
				) : null}
				{items.length > 0 ? (
					<span className="text-muted-foreground text-xs">
						{t("triage.queueCount", { count: items.length })}
					</span>
				) : null}
			</div>

			{triage.isError ? (
				<Alert variant="destructive" className="mt-6">
					<CircleAlert />
					<AlertDescription className="flex flex-col items-start gap-2">
						{apiErrorMessage(t, triage.error)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => void triage.refetch()}
						>
							{t("common.retry")}
						</Button>
					</AlertDescription>
				</Alert>
			) : null}

			{triage.isPending ? (
				<ItemGroup className="mt-6" aria-busy="true" aria-hidden="true">
					{SKELETON_ROWS.map((key) => (
						<Item key={key} variant="outline" className="gap-3">
							<Skeleton className="size-4 rounded-sm" />
							<div className="flex min-w-0 flex-1 flex-col gap-2">
								<Skeleton className="h-4 w-2/3" />
								<Skeleton className="h-3 w-1/3" />
							</div>
							<Skeleton className="h-8 w-32" />
						</Item>
					))}
				</ItemGroup>
			) : null}

			{!triage.isPending && !triage.isError && items.length === 0 ? (
				<EmptyState
					icon={Inbox}
					title={t("triage.empty")}
					description={t("triage.emptyDescription")}
				/>
			) : null}

			{items.length > 0 ? (
				<>
					<div className="mt-6 flex items-center gap-2">
						<Checkbox
							aria-label={t("triage.selectAll")}
							checked={selected.size === items.length && items.length > 0}
							indeterminate={selected.size > 0 && selected.size < items.length}
							onCheckedChange={(checked) => toggleAll(checked === true)}
							disabled={!availability.select}
						/>
						<span className="text-muted-foreground text-xs">
							{selected.size > 0
								? t("bulk.selected", { count: selected.size })
								: t("triage.selectAll")}
						</span>
						{selected.size > 0 ? (
							<div className="ml-auto flex items-center gap-2">
								<Button
									size="sm"
									disabled={!availability.accept}
									onClick={() => runBulk("accept")}
								>
									{t("triage.acceptSelected")}
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={!availability.decline}
									onClick={() => runBulk("decline")}
								>
									{t("triage.declineSelected")}
								</Button>
							</div>
						) : null}
					</div>

					<ItemGroup className="mt-3">
						{items.map((issue) => (
							<Item
								key={issue.id}
								variant="outline"
								className="gap-3"
								aria-label={issue.identifier}
							>
								<ItemMedia>
									<Checkbox
										aria-label={t("triage.selectIssue", {
											identifier: issue.identifier,
										})}
										checked={selected.has(issue.id)}
										onCheckedChange={(checked) =>
											toggleOne(issue.id, checked === true)
										}
										disabled={!availability.select}
									/>
								</ItemMedia>
								<ItemContent
									role="link"
									tabIndex={0}
									className="cursor-pointer gap-1"
									onClick={() => openIssue(issue)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											openIssue(issue);
										}
									}}
								>
									<span className="flex min-w-0 items-center gap-2">
										<Badge
											variant="outline"
											className="shrink-0 rounded-md font-mono"
										>
											{issue.identifier}
										</Badge>
										<span className="truncate text-sm font-medium">
											{issue.title}
										</span>
									</span>
									<span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
										<span>{issue.projectKey}</span>
										<span aria-hidden="true">·</span>
										<span>
											{t("triage.createdAt", {
												date: dateFormat.format(new Date(issue.createdAt)),
											})}
										</span>
										<span aria-hidden="true">·</span>
										<span>
											{t("triage.createdBy", {
												name:
													(issue.createdById
														? memberNames.get(issue.createdById)
														: undefined) ?? t("common.unknown"),
											})}
										</span>
									</span>
								</ItemContent>
								<ItemActions className="gap-1">
									<Button
										size="sm"
										disabled={!availability.accept}
										onClick={() => run(issue, "accept")}
									>
										{t("triage.accept")}
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={!availability.decline}
										onClick={() => run(issue, "decline")}
									>
										{t("triage.decline")}
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
				</>
			) : null}
		</div>
	);
}
