import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { badgeVariants } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/user-avatar";
import {
	ORG_ACTIVITY_MAX_LIMIT,
	ORG_ACTIVITY_PAGE_SIZE,
	orgActivitiesQuery,
} from "@/features/activities/data";
import {
	activityDayLabel,
	groupActivitiesByDay,
} from "@/features/activities/grouping";
import { ActivitySentence } from "@/features/issues/components/activity-sentence";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery } from "@/features/members/data";
import { projectsQuery } from "@/features/projects/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
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
	const groups = groupActivitiesByDay(items);
	const canLoadMore = limit < ORG_ACTIVITY_MAX_LIMIT && items.length >= limit;

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-8">
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
					<ul
						className="flex flex-col gap-4"
						aria-hidden="true"
						aria-busy="true"
					>
						{["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"].map(
							(itemKey) => (
								<li key={itemKey} className="flex gap-3">
									<Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
									<div className="flex min-w-0 flex-1 flex-col gap-1.5">
										<Skeleton className="h-4 w-2/3" />
										<Skeleton className="h-3.5 w-1/3" />
									</div>
								</li>
							),
						)}
					</ul>
				)}
				{activities.isError && (
					<p className="py-8 text-center text-sm text-red-500">
						{apiErrorMessage(t, activities.error)}
					</p>
				)}
				{!activities.isPending && items.length === 0 && !activities.isError && (
					<div className="border-muted-foreground/25 rounded-xl border border-dashed py-16 text-center">
						<p className="text-muted-foreground">{t("activityFeed.empty")}</p>
					</div>
				)}
				{groups.map((group) => (
					<section key={group.key} className="flex flex-col gap-3">
						<h2 className="text-muted-foreground text-xs font-medium">
							{activityDayLabel(group.key, t)}
						</h2>
						<ul className="flex flex-col gap-4">
							{group.activities.map((activity) => (
								<li key={activity.id} className="flex gap-3">
									<UserAvatar
										name={activity.actor.name}
										className="mt-0.5 size-6 shrink-0"
									/>
									<div className="flex min-w-0 flex-1 flex-col gap-1">
										<div className="flex items-start justify-between gap-4">
											<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
												<ActivitySentence
													activity={activity}
													members={members.data ?? []}
													labels={labels.data ?? []}
												/>
												{activity.issue &&
													activity.project &&
													(activity.action === "issue.deleted" ? (
														<span
															className={cn(
																badgeVariants({ variant: "secondary" }),
																"max-w-full rounded-md font-mono",
															)}
														>
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
															className={cn(
																badgeVariants({ variant: "secondary" }),
																"max-w-full rounded-md font-mono hover:bg-secondary/80",
															)}
														>
															{activity.project.key}-{activity.issue.number}{" "}
															{activity.issue.title}
														</Link>
													))}
											</div>
											<time
												dateTime={activity.createdAt}
												title={formatDateTime(activity.createdAt)}
												className="text-muted-foreground hidden shrink-0 text-xs sm:block"
											>
												{formatRelativeTime(activity.createdAt)}
											</time>
										</div>
										<time
											dateTime={activity.createdAt}
											title={formatDateTime(activity.createdAt)}
											className="text-muted-foreground text-xs sm:hidden"
										>
											{formatRelativeTime(activity.createdAt)}
										</time>
									</div>
								</li>
							))}
						</ul>
					</section>
				))}
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
