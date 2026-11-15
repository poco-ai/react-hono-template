import type { LabelDto } from "@api/dto/label.dto";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert } from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import {
	flattenActivityPages,
	orgActivitiesInfiniteQuery,
} from "@/features/activities/data";
import {
	type ActivityItemRow,
	activityDayLabel,
	buildActivityRows,
	groupActivitiesByDay,
} from "@/features/activities/grouping";
import { ActivitySentence } from "@/features/issues/components/activity-sentence";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery, type OrgMember } from "@/features/members/data";
import { projectsQuery } from "@/features/projects/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

const ALL_PROJECTS = "__all__";

function ActivityFeedItem({
	row,
	orgId,
	members,
	labels,
	last,
}: {
	row: ActivityItemRow;
	orgId: string;
	members: OrgMember[];
	labels: LabelDto[];
	last: boolean;
}) {
	const { activity } = row;
	return (
		<div className={cn("flex gap-3", !last && "pb-4")}>
			<UserAvatar
				name={activity.actor.name}
				image={activity.actor.image}
				className="mt-0.5 size-6 shrink-0"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-start justify-between gap-4">
					<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
						<ActivitySentence
							activity={activity}
							members={members}
							labels={labels}
						/>
						{activity.issue &&
							activity.project &&
							(activity.action === "issue.deleted" ? (
								<Badge
									variant="secondary"
									className="max-w-full rounded-md font-mono"
								>
									{activity.project.key}-{activity.issue.number}{" "}
									{activity.issue.title}
								</Badge>
							) : (
								<Badge
									variant="secondary"
									className="max-w-full rounded-md font-mono hover:bg-secondary/80"
									render={
										<Link
											to="/orgs/$orgId/projects/$projectId/$issueNumber"
											params={{
												orgId,
												projectId: activity.project.id,
												issueNumber: String(activity.issue.number),
											}}
										/>
									}
								>
									{activity.project.key}-{activity.issue.number}{" "}
									{activity.issue.title}
								</Badge>
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
		</div>
	);
}

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
	const projects = useQuery(projectsQuery(orgId));
	const members = useQuery(membersQuery(orgId));
	const labels = useQuery(labelsQuery(orgId));
	const activities = useInfiniteQuery(
		orgActivitiesInfiniteQuery(orgId, { projectId: projectId || undefined }),
	);

	const pages = activities.data?.pages;
	const items = useMemo(() => flattenActivityPages(pages), [pages]);
	const rows = useMemo(
		() => buildActivityRows(groupActivitiesByDay(items)),
		[items],
	);
	const hasRows = rows.length > 0;

	const listRef = useRef<HTMLUListElement | null>(null);
	const [scrollMargin, setScrollMargin] = useState(0);

	// Stable row identity keeps the virtualizer from re-measuring the whole
	// feed on every scroll-driven re-render.
	const estimateRowSize = useCallback(
		(index: number) => (rows[index].type === "day" ? 32 : 76),
		[rows],
	);
	const getRowKey = useCallback((index: number) => rows[index].key, [rows]);

	const virtualizer = useWindowVirtualizer({
		count: rows.length,
		estimateSize: estimateRowSize,
		overscan: 8,
		getItemKey: getRowKey,
		scrollMargin,
	});

	// The feed scrolls with the window, so the list's document offset is the
	// virtualizer's scroll margin. Re-measure when it mounts and on resize
	// (the header above it can wrap differently at other widths).
	useLayoutEffect(() => {
		if (!hasRows) {
			return;
		}
		const measure = () => setScrollMargin(listRef.current?.offsetTop ?? 0);
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [hasRows]);

	// A new filter starts a new feed; skip the mount run so restored scroll
	// positions and deep links are not reset.
	const previousProjectId = useRef(projectId);
	useEffect(() => {
		if (previousProjectId.current === projectId) {
			return;
		}
		previousProjectId.current = projectId;
		virtualizer.scrollToOffset(0);
	}, [projectId, virtualizer]);

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
					<Alert variant="destructive" className="my-8">
						<CircleAlert />
						<AlertDescription>
							{apiErrorMessage(t, activities.error)}
						</AlertDescription>
					</Alert>
				)}
				{!activities.isPending && !hasRows && !activities.isError && (
					<EmptyState title={t("activityFeed.empty")} />
				)}
				{hasRows && (
					<ul
						ref={listRef}
						className="relative"
						style={{
							height: Math.max(virtualizer.getTotalSize() - scrollMargin, 0),
						}}
					>
						{virtualizer.getVirtualItems().map((item) => {
							const row = rows[item.index];
							const last = item.index === rows.length - 1;
							return (
								<li
									key={item.key}
									ref={virtualizer.measureElement}
									data-index={item.index}
									className="absolute top-0 left-0 w-full"
									style={{
										transform: `translateY(${item.start - scrollMargin}px)`,
									}}
								>
									{row.type === "day" ? (
										<div className="pb-3">
											<h2 className="text-muted-foreground text-xs font-medium">
												{activityDayLabel(row.dayKey, t)}
											</h2>
										</div>
									) : (
										<ActivityFeedItem
											row={row}
											orgId={orgId}
											members={members.data ?? []}
											labels={labels.data ?? []}
											last={last}
										/>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{activities.hasNextPage && (
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						disabled={activities.isFetchingNextPage}
						onClick={() => {
							void activities.fetchNextPage();
						}}
					>
						{activities.isFetchingNextPage && <Spinner />}
						{t("common.loadMore")}
					</Button>
				)}
			</div>
		</div>
	);
}
