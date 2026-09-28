import type { IssueDetailDto } from "@api/dto/issue.dto";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ISSUE_STATUSES, type IssueStatus } from "@workspace/shared";
import { useTranslation } from "react-i18next";
import { PriorityBadge } from "@/components/issue/priority-badge";
import { StatusBadge } from "@/components/issue/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { formatDueDate } from "@/lib/issue-utils";
import { orgIssuesQuery } from "@/lib/queries/issues";
import { projectsQuery } from "@/lib/queries/projects";
import { useSession } from "@/lib/session";

export function MyIssuesPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
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
		<div className="mx-auto max-w-4xl p-8">
			<h1 className="text-2xl font-semibold tracking-tight">
				{t("issues.myIssuesTitle")}
			</h1>
			<div className="mt-6 flex flex-col gap-8">
				{issues.isPending && (
					<p className="text-muted-foreground py-8 text-center text-sm">
						{t("common.loading")}
					</p>
				)}
				{issues.isError && (
					<p className="py-8 text-center text-sm text-red-500">
						{issues.error.message}
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
											issueNumber: issue.number,
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
										<span className="text-muted-foreground hidden w-24 shrink-0 text-xs sm:inline">
											{formatDueDate(issue.dueDate)}
										</span>
										{session && <UserAvatar name={session.user.name} />}
									</Link>
								);
							})}
						</div>
					</section>
				))}
				{!issues.isPending && grouped.size === 0 && !issues.isError && (
					<div className="border-muted-foreground/25 rounded-xl border border-dashed py-16 text-center">
						<p className="text-muted-foreground">{t("issues.myIssuesEmpty")}</p>
					</div>
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
