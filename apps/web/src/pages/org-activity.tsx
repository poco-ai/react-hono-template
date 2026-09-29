import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivitySentence } from "@/components/issue/activity-sentence";
import { UserAvatar } from "@/components/user-avatar";
import { formatDateTime, formatRelativeTime } from "@/lib/issue-utils";
import {
	ORG_ACTIVITY_MAX_LIMIT,
	ORG_ACTIVITY_PAGE_SIZE,
	orgActivitiesQuery,
} from "@/lib/queries/activities";
import { labelsQuery } from "@/lib/queries/labels";
import { membersQuery } from "@/lib/queries/members";
import { projectsQuery } from "@/lib/queries/projects";
import { useDocumentTitle } from "@/lib/use-document-title";

const ALL_PROJECTS = "__all__";

export function OrgActivityPage({
	orgId,
	projectId,
	onProjectChange,
}: {
	orgId: string;
	projectId?: string;
	onProjectChange: (projectId: string) => void;
}) {
	const { t } = useTranslation();
	useDocumentTitle(t("activityFeed.title"));
	const [limit, setLimit] = useState(ORG_ACTIVITY_PAGE_SIZE);
	const projects = useQuery(projectsQuery(orgId));
	const members = useQuery(membersQuery(orgId));
	const labels = useQuery(labelsQuery(orgId));
	const activities = useQuery(
		orgActivitiesQuery(orgId, {
			projectId: projectId || undefined,
			limit,
		}),
	);

	const items = activities.data ?? [];
	const canLoadMore = limit < ORG_ACTIVITY_MAX_LIMIT && items.length >= limit;

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						{t("activityFeed.title")}
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						{t("activityFeed.description")}
					</p>
				</div>
				<Select
					value={projectId ?? ALL_PROJECTS}
					onValueChange={(value) =>
						onProjectChange(value && value !== ALL_PROJECTS ? value : "")
					}
				>
					<SelectTrigger className="w-44">
						<SelectValue>
							{projectId
								? ((projects.data ?? []).find((p) => p.id === projectId)
										?.name ?? t("activityFeed.allProjects"))
								: t("activityFeed.allProjects")}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_PROJECTS}>
							{t("activityFeed.allProjects")}
						</SelectItem>
						{(projects.data ?? []).map((project) => (
							<SelectItem key={project.id} value={project.id}>
								{project.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="mt-6 flex flex-col gap-4">
				{activities.isPending && (
					<p className="text-muted-foreground py-8 text-center text-sm">
						{t("common.loading")}
					</p>
				)}
				{activities.isError && (
					<p className="py-8 text-center text-sm text-red-500">
						{activities.error.message}
					</p>
				)}
				{!activities.isPending && items.length === 0 && !activities.isError && (
					<div className="border-muted-foreground/25 rounded-xl border border-dashed py-16 text-center">
						<p className="text-muted-foreground">{t("activityFeed.empty")}</p>
					</div>
				)}
				<ul className="flex flex-col gap-4">
					{items.map((activity) => (
						<li key={activity.id} className="flex gap-3">
							<UserAvatar
								name={activity.actor.name}
								className="mt-0.5 size-6 shrink-0"
							/>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<div className="flex flex-wrap items-baseline gap-x-2">
									<ActivitySentence
										activity={activity}
										members={members.data ?? []}
										labels={labels.data ?? []}
									/>
									{activity.issue &&
										activity.project &&
										(activity.action === "issue.deleted" ? (
											<span className="text-muted-foreground truncate font-mono text-xs">
												{activity.project.key}-{activity.issue.number}{" "}
												{activity.issue.title}
											</span>
										) : (
											<Link
												to="/orgs/$orgId/projects/$projectId/$issueNumber"
												params={{
													orgId,
													projectId: activity.project.id,
													issueNumber: String(activity.issue.number),
												}}
												className="text-muted-foreground hover:text-foreground truncate font-mono text-xs hover:underline"
											>
												{activity.project.key}-{activity.issue.number}{" "}
												{activity.issue.title}
											</Link>
										))}
								</div>
								<time
									dateTime={activity.createdAt}
									title={formatDateTime(activity.createdAt)}
									className="text-muted-foreground text-xs"
								>
									{formatRelativeTime(activity.createdAt)}
								</time>
							</div>
						</li>
					))}
				</ul>
				{canLoadMore && (
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						disabled={activities.isFetching}
						onClick={() =>
							setLimit((prev) =>
								Math.min(ORG_ACTIVITY_MAX_LIMIT, prev + ORG_ACTIVITY_PAGE_SIZE),
							)
						}
					>
						{activities.isFetching && <Loader2 className="animate-spin" />}
						{t("common.loadMore")}
					</Button>
				)}
			</div>
		</div>
	);
}
