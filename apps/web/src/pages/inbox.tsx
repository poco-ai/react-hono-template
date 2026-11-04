import type { NotificationDto } from "@api/dto/notification.dto";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { NotificationFilter } from "@workspace/shared";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemMedia,
} from "@workspace/ui/components/item";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Archive, Bell, Check, CheckCheck, CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import {
	notificationHash,
	notificationsQuery,
	unreadCountQuery,
	useArchiveNotification,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
} from "@/features/notifications/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5"];

export function InboxPage({
	orgId,
	filter,
	onFilterChange,
}: {
	orgId: string;
	filter: NotificationFilter;
	onFilterChange: (filter: NotificationFilter) => void;
}) {
	const { t } = useTranslation();
	useDocumentTitle(t("notifications.title"));
	const navigate = useNavigate();
	const frozen = useOrgFrozen(orgId);

	const notifications = useInfiniteQuery(notificationsQuery(orgId, filter));
	const unread = useQuery(unreadCountQuery(orgId));

	const markAllRead = useMarkAllNotificationsRead(orgId, {
		onSuccess: () => toast.success(t("notifications.toast.allRead")),
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});
	const markRead = useMarkNotificationRead(orgId, {
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});
	const archive = useArchiveNotification(orgId, {
		onSuccess: () => toast.success(t("notifications.toast.archived")),
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});

	const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
	const unreadCount =
		unread.data?.unread ?? notifications.data?.pages[0]?.unread ?? 0;

	const openNotification = (notification: NotificationDto) => {
		if (!notification.readAt) {
			markRead.mutate(notification.id);
		}
		void navigate({
			to: "/orgs/$orgId/projects/$projectId/$issueNumber",
			params: {
				orgId,
				projectId: notification.issue.projectId,
				issueNumber: String(notification.issue.number),
			},
			hash: notificationHash(notification),
		});
	};

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						{t("notifications.title")}
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						{t("notifications.description")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={frozen || unreadCount === 0 || markAllRead.isPending}
					onClick={() => markAllRead.mutate()}
				>
					{markAllRead.isPending ? <Spinner /> : <CheckCheck />}
					{t("notifications.markAllRead")}
				</Button>
			</div>

			<Tabs
				value={filter}
				className="mt-6"
				onValueChange={(value) => {
					if (value === "all" || value === "unread") {
						onFilterChange(value);
					}
				}}
			>
				<TabsList aria-label={t("notifications.filterLabel")}>
					<TabsTrigger value="all">{t("notifications.tabs.all")}</TabsTrigger>
					<TabsTrigger value="unread">
						{t("notifications.tabs.unread")}
						{unreadCount > 0 ? (
							<Badge variant="secondary" className="px-1.5 tabular-nums">
								{unreadCount}
							</Badge>
						) : null}
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{frozen ? (
				<Alert className="mt-4">
					<CircleAlert />
					<AlertTitle>{t("org.frozenBanner")}</AlertTitle>
				</Alert>
			) : null}

			<div className="mt-4 flex flex-col gap-3">
				{notifications.isPending ? (
					<ItemGroup aria-busy="true" aria-hidden="true">
						{SKELETON_ROWS.map((key) => (
							<Item key={key} variant="outline" className="items-start gap-3">
								<Skeleton className="size-7 shrink-0 rounded-full" />
								<div className="flex min-w-0 flex-1 flex-col gap-2">
									<Skeleton className="h-4 w-2/3" />
									<Skeleton className="h-3.5 w-1/2" />
								</div>
							</Item>
						))}
					</ItemGroup>
				) : null}

				{notifications.isError ? (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertTitle>{t("notifications.loadError")}</AlertTitle>
						<AlertDescription className="flex flex-col items-start gap-2">
							{apiErrorMessage(t, notifications.error)}
							<Button
								variant="outline"
								size="sm"
								onClick={() => void notifications.refetch()}
							>
								{t("common.retry")}
							</Button>
						</AlertDescription>
					</Alert>
				) : null}

				{!notifications.isPending &&
				!notifications.isError &&
				items.length === 0 ? (
					<EmptyState
						icon={Bell}
						title={
							filter === "unread"
								? t("notifications.emptyUnread")
								: t("notifications.empty")
						}
						description={t("notifications.emptyDescription")}
					/>
				) : null}

				{items.length > 0 ? (
					<ItemGroup>
						{items.map((notification) => {
							const actorName =
								notification.actor?.name ?? t("notifications.unknownActor");
							return (
								<Item
									key={notification.id}
									variant="outline"
									className={
										notification.readAt
											? "items-start gap-3"
											: "items-start gap-3 bg-accent/40"
									}
								>
									<ItemMedia className="pt-0.5">
										<UserAvatar
											name={actorName}
											image={notification.actor?.image}
											className="size-7"
										/>
									</ItemMedia>
									<ItemContent
										role="link"
										tabIndex={0}
										aria-label={t("notifications.openNotification")}
										className="cursor-pointer gap-1.5"
										onClick={() => openNotification(notification)}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												openNotification(notification);
											}
										}}
									>
										<div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
											<span className="font-medium">{actorName}</span>
											<span className="text-muted-foreground">
												{t(`notifications.actions.${notification.type}`)}
											</span>
											<Badge
												variant="secondary"
												className="max-w-full truncate font-mono"
											>
												{notification.project.key}-{notification.issue.number}{" "}
												{notification.issue.title}
											</Badge>
										</div>
										{notification.commentExcerpt ? (
											<p className="text-muted-foreground line-clamp-2 text-sm break-words">
												{notification.commentExcerpt}
											</p>
										) : null}
										<div className="text-muted-foreground flex items-center gap-2 text-xs">
											{notification.readAt ? null : (
												<span
													className="bg-primary size-2 shrink-0 rounded-full"
													aria-hidden="true"
												/>
											)}
											<time
												dateTime={notification.createdAt}
												title={formatDateTime(notification.createdAt)}
											>
												{formatRelativeTime(notification.createdAt)}
											</time>
										</div>
									</ItemContent>
									<ItemActions className="opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 max-sm:opacity-100">
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={t("notifications.markRead")}
											disabled={frozen || Boolean(notification.readAt)}
											onClick={() => markRead.mutate(notification.id)}
										>
											<Check />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={t("notifications.archive")}
											disabled={frozen}
											onClick={() => archive.mutate(notification.id)}
										>
											<Archive />
										</Button>
									</ItemActions>
								</Item>
							);
						})}
					</ItemGroup>
				) : null}

				{notifications.hasNextPage ? (
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						disabled={notifications.isFetchingNextPage}
						onClick={() => void notifications.fetchNextPage()}
					>
						{notifications.isFetchingNextPage ? <Spinner /> : null}
						{t("common.loadMore")}
					</Button>
				) : null}
			</div>
		</div>
	);
}
