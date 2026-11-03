import type { IssueDetailDto } from "@api/dto/issue.dto";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ISSUE_STATUSES, type IssueStatus } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { CircleAlert } from "lucide-react";
import { Fragment } from "react";
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

function MyIssuesTableHeader() {
	const { t } = useTranslation();

	return (
		<TableHeader>
			<TableRow>
				<TableHead className="w-24">{t("issues.number")}</TableHead>
				<TableHead>{t("issues.titleField")}</TableHead>
				<TableHead className="w-24">{t("issues.priority")}</TableHead>
				<TableHead className="hidden w-28 sm:table-cell">
					{t("issues.project")}
				</TableHead>
				<TableHead className="hidden w-28 sm:table-cell">
					{t("issues.dueDate")}
				</TableHead>
				<TableHead className="w-12">
					<span className="sr-only">{t("issues.assignee")}</span>
				</TableHead>
			</TableRow>
		</TableHeader>
	);
}

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
					<Table className="table-fixed" aria-hidden="true" aria-busy="true">
						<MyIssuesTableHeader />
						<TableBody>
							{["row-1", "row-2", "row-3", "row-4", "row-5"].map((rowKey) => (
								<TableRow key={rowKey}>
									<TableCell>
										<Skeleton className="h-3 w-16" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-full" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-5 w-16 rounded-full" />
									</TableCell>
									<TableCell className="hidden sm:table-cell">
										<Skeleton className="h-3 w-20" />
									</TableCell>
									<TableCell className="hidden sm:table-cell">
										<Skeleton className="h-3 w-16" />
									</TableCell>
									<TableCell>
										<Skeleton className="size-6 rounded-full" />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
				{issues.isError && (
					<Alert variant="destructive" className="my-8">
						<CircleAlert />
						<AlertDescription>
							{apiErrorMessage(t, issues.error)}
						</AlertDescription>
					</Alert>
				)}
				{grouped.size > 0 && (
					<Table className="table-fixed">
						<MyIssuesTableHeader />
						<TableBody>
							{[...grouped.entries()].map(([status, items]) => (
								<Fragment key={status}>
									<TableRow className="hover:bg-transparent">
										<TableCell colSpan={6} className="bg-muted/40 py-2">
											<div className="flex items-center gap-2">
												<StatusBadge status={status} />
												<span className="text-muted-foreground text-sm">
													{items.length}
												</span>
											</div>
										</TableCell>
									</TableRow>
									{items.map((issue) => {
										const project = projectById.get(issue.projectId);
										const params = {
											orgId,
											projectId: issue.projectId,
											issueNumber: String(issue.number),
										};
										return (
											<TableRow
												key={issue.id}
												className="cursor-pointer"
												onClick={() =>
													navigate({
														to: "/orgs/$orgId/projects/$projectId/$issueNumber",
														params,
													})
												}
											>
												<TableCell className="text-muted-foreground font-mono text-xs">
													{project
														? `${project.key}-${issue.number}`
														: issue.number}
												</TableCell>
												<TableCell className="max-w-0">
													<Link
														to="/orgs/$orgId/projects/$projectId/$issueNumber"
														params={params}
														className="block truncate hover:underline"
														onClick={(event) => event.stopPropagation()}
													>
														{issue.title}
													</Link>
												</TableCell>
												<TableCell>
													<PriorityBadge value={issue.priority} />
												</TableCell>
												<TableCell className="hidden text-muted-foreground text-xs sm:table-cell">
													<span className="block truncate">
														{project?.name}
													</span>
												</TableCell>
												<TableCell className="hidden text-xs sm:table-cell">
													<DueDateLabel value={issue.dueDate} />
												</TableCell>
												<TableCell>
													{session && <UserAvatar name={session.user.name} />}
												</TableCell>
											</TableRow>
										);
									})}
								</Fragment>
							))}
						</TableBody>
					</Table>
				)}
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
