import type { IssueDetailDto } from "@api/dto/issue.dto";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ISSUE_STATUSES, type IssueStatus } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { useSession } from "@/features/auth/data";
import { DueDateLabel } from "@/features/issues/components/issue-list";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { orgIssuesQuery } from "@/features/issues/data";
import { projectsQuery } from "@/features/projects/data";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

export function MyIssuesPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	useDocumentTitle(t("issues.myIssuesTitle"));
	const { data: session } = useSession();
	const userId = session?.user.id;
	const projects = useQuery(projectsQuery(orgId));
	const issues = useQuery({
		...orgIssuesQuery(orgId, {
			assigneeId: userId ?? "",
			status: [],
			priority: [],
			search: "",
			sort: "updated",
			page: 1,
			pageSize: 100,
		}),
		enabled: userId !== undefined,
	});

	const projectById = new Map(
		(projects.data ?? []).map((project) => [project.id, project]),
	);

	const grouped = new Map<IssueStatus, IssueDetailDto[]>();
	if (issues.data) {
		for (const status of ISSUE_STATUSES) {
			const items = issues.data.items.filter(
				(issue) => issue.status === status,
			);
			if (items.length > 0) {
				grouped.set(status, items);
			}
		}
	}

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6">
			<h1 className="text-2xl font-semibold tracking-tight">
				{t("issues.myIssuesTitle")}
			</h1>
			<div className="mt-6 flex flex-col gap-8">
				{issues.isPending && (
					<div
						className="overflow-hidden rounded-lg border"
						aria-hidden="true"
						aria-busy="true"
					>
						{["row-1", "row-2", "row-3", "row-4", "row-5"].map((rowKey) => (
							<div
								key={rowKey}
								className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
							>
								<Skeleton className="h-3 w-20 shrink-0" />
								<Skeleton className="h-4 min-w-0 flex-1" />
								<Skeleton className="h-5 w-16 shrink-0 rounded-full" />
								<Skeleton className="hidden h-3 w-24 shrink-0 sm:block" />
								<Skeleton className="hidden h-3 w-16 shrink-0 sm:block" />
								<Skeleton className="size-6 shrink-0 rounded-full" />
							</div>
						))}
					</div>
				)}
				{issues.isError && (
					<p className="py-8 text-center text-sm text-red-500">
						{apiErrorMessage(t, issues.error)}
					</p>
				)}
				{[...grouped.entries()].map(([status, items]) => (
					<section key={status}>
						<div className="mb-2 flex items-center gap-2">
							<StatusBadge status={status} />
							<span className="text-muted-foreground text-sm">
								{items.length}
							</span>
						</div>
						<div className="overflow-hidden rounded-lg border">
							{items.map((issue) => {
								const project = projectById.get(issue.projectId);
								return (
									<Link
										key={issue.id}
										to="/orgs/$orgId/projects/$projectId/$issueNumber"
										params={{
											orgId,
											projectId: issue.projectId,
											issueNumber: String(issue.number),
										}}
										className="hover:bg-accent/40 flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
									>
										<span className="text-muted-foreground w-24 shrink-0 font-mono text-xs">
											{project
												? `${project.key}-${issue.number}`
												: issue.number}
										</span>
										<span className="min-w-0 flex-1 truncate">
											{issue.title}
										</span>
										<PriorityBadge value={issue.priority} />
										{project && (
											<span className="text-muted-foreground hidden w-28 shrink-0 truncate text-xs sm:inline">
												{project.name}
											</span>
										)}
										<span className="hidden w-28 shrink-0 text-xs sm:inline">
											<DueDateLabel value={issue.dueDate} />
										</span>
										{session && <UserAvatar name={session.user.name} />}
									</Link>
								);
							})}
						</div>
					</section>
				))}
				{!issues.isPending && grouped.size === 0 && !issues.isError && (
					<EmptyState
						title={t("issues.myIssuesEmpty")}
						action={
							<Button
								variant="outline"
								onClick={() =>
									navigate({ to: "/orgs/$orgId/projects", params: { orgId } })
								}
							>
								{t("issues.browseProjects")}
							</Button>
						}
					/>
				)}
				{issues.data && issues.data.total > issues.data.items.length && (
					<p className="text-muted-foreground text-sm">
						{t("issues.showingCap", { count: issues.data.items.length })}
					</p>
				)}
			</div>
		</div>
	);
}
