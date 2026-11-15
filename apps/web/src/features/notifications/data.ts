import type { IssueSubscriptionDto } from "@api/dto/issue-subscription.dto";
import type {
	NotificationDto,
	NotificationListDto,
	NotificationUnreadCountDto,
} from "@api/dto/notification.dto";
import {
	type InfiniteData,
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	NotificationFilter,
	UpdateIssueSubscriptionInput,
} from "@workspace/shared";
import {
	issueSubscriptionKey,
	notificationsRootKey,
	notificationsUnreadCountKey,
} from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { type OptimisticPatch, optimisticPatch } from "@/lib/optimistic";
import {
	type OptimisticMutationCallbacks,
	useOptimisticMutation,
} from "@/lib/optimistic-mutation";
import { nextPageParam } from "@/lib/pagination";

/** Page size of the inbox list; the API caps `pageSize` at 100. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * Unread-count refresh cadence for the sidebar badge and the inbox header.
 * TanStack Query pauses this while the tab is hidden and refetches as soon as
 * the window regains focus, so stale badges catch up without a WebSocket.
 */
export const NOTIFICATION_POLL_INTERVAL_MS = 45_000;

export const notificationsListKey = (
	orgId: string,
	filter: NotificationFilter,
) => [...notificationsRootKey(orgId), "list", filter] as const;

export function fetchNotificationsPage(
	orgId: string,
	filter: NotificationFilter,
	page: number,
): Promise<NotificationListDto> {
	return unwrap(
		client.api.orgs[":orgId"].notifications.$get({
			param: { orgId },
			query: {
				page: String(page),
				pageSize: String(NOTIFICATIONS_PAGE_SIZE),
				filter,
			},
		}),
	);
}

/** Infinite inbox: "load more" follows `page * pageSize < total`. */
export function notificationsQuery(orgId: string, filter: NotificationFilter) {
	return infiniteQueryOptions({
		queryKey: notificationsListKey(orgId, filter),
		queryFn: ({ pageParam }): Promise<NotificationListDto> =>
			fetchNotificationsPage(orgId, filter, pageParam),
		initialPageParam: 1,
		getNextPageParam: nextPageParam,
	});
}

export function unreadCountQuery(orgId: string) {
	return queryOptions({
		queryKey: notificationsUnreadCountKey(orgId),
		queryFn: (): Promise<NotificationUnreadCountDto> =>
			unwrap(
				client.api.orgs[":orgId"].notifications["unread-count"].$get({
					param: { orgId },
				}),
			),
		refetchInterval: NOTIFICATION_POLL_INTERVAL_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
		staleTime: NOTIFICATION_POLL_INTERVAL_MS,
	});
}

export const markNotificationRead = (orgId: string, notificationId: string) =>
	unwrap(
		client.api.orgs[":orgId"].notifications[":notificationId"].read.$post({
			param: { orgId, notificationId },
		}),
	);

export const markAllNotificationsRead = (orgId: string) =>
	unwrap(
		client.api.orgs[":orgId"].notifications["read-all"].$post({
			param: { orgId },
		}),
	);

/** Archive = remove the row from this user's inbox (the API `DELETE`). */
export const archiveNotification = (orgId: string, notificationId: string) =>
	unwrap(
		client.api.orgs[":orgId"].notifications[":notificationId"].$delete({
			param: { orgId, notificationId },
		}),
	);

/**
 * Coarse reset for cases where the whole inbox is unknown. Read/archive
 * mutations deliberately patch the cached pages in place instead: invalidating
 * an offset-paginated list while the unread filter is active removes rows and
 * shifts every following page.
 */
export const invalidateNotificationQueries = (
	queryClient: QueryClient,
	orgId: string,
) => queryClient.invalidateQueries({ queryKey: notificationsRootKey(orgId) });

type NotificationListData = InfiniteData<NotificationListDto, number>;

const notificationListPrefix = (orgId: string) =>
	[...notificationsRootKey(orgId), "list"] as const;

const isNotificationFilter = (value: unknown): value is NotificationFilter =>
	value === "all" || value === "unread";

/** Keeps the per-page unread badge in sync with the unpaginated counter. */
const withUnread = (
	data: NotificationListData,
	unread: number | undefined,
): NotificationListData =>
	unread === undefined || data.pages.every((page) => page.unread === unread)
		? data
		: {
				...data,
				pages: data.pages.map((page) =>
					page.unread === unread ? page : { ...page, unread },
				),
			};

/**
 * One patch per cached inbox page, covering every mounted filter. The keys are
 * read from the cache at mutate time so the optimistic write and its rollback
 * always target the pages the user can see.
 */
const notificationListPatches = (
	queryClient: QueryClient,
	orgId: string,
	update: (
		data: NotificationListData,
		filter: NotificationFilter,
	) => NotificationListData,
	unread: number | undefined,
): OptimisticPatch[] =>
	queryClient
		.getQueriesData<NotificationListData>({
			queryKey: notificationListPrefix(orgId),
		})
		.flatMap(([queryKey]) => {
			const filter = queryKey[queryKey.length - 1];
			if (!isNotificationFilter(filter)) {
				return [];
			}
			return [
				optimisticPatch<NotificationListData>(queryKey, (previous) =>
					previous ? withUnread(update(previous, filter), unread) : previous,
				),
			];
		});

/**
 * Patches the unpaginated counter only when it is already cached: without a
 * counter the badge falls back to `pages[0].unread`, which the list patches
 * already update (and which roll back together with them).
 */
const unreadCounterPatches = (
	queryClient: QueryClient,
	orgId: string,
	unread: number | undefined,
): OptimisticPatch[] => {
	const queryKey = notificationsUnreadCountKey(orgId);
	if (
		unread === undefined ||
		queryClient.getQueryData(queryKey) === undefined
	) {
		return [];
	}
	return [
		optimisticPatch<NotificationUnreadCountDto>(queryKey, () => ({ unread })),
	];
};

const updateNotificationLists = (
	queryClient: QueryClient,
	orgId: string,
	update: (
		data: NotificationListData,
		filter: NotificationFilter,
	) => NotificationListData,
) => {
	for (const [key, data] of queryClient.getQueriesData<NotificationListData>({
		queryKey: notificationListPrefix(orgId),
	})) {
		if (!data) {
			continue;
		}
		const filter = key[key.length - 1];
		if (filter !== "all" && filter !== "unread") {
			continue;
		}
		const next = update(data, filter);
		if (next !== data) {
			queryClient.setQueryData(key, next);
		}
	}
};

const readUnreadCount = (queryClient: QueryClient, orgId: string) => {
	const cached = queryClient.getQueryData<NotificationUnreadCountDto>(
		notificationsUnreadCountKey(orgId),
	)?.unread;
	if (typeof cached === "number") {
		return cached;
	}
	const [first] = queryClient.getQueriesData<NotificationListData>({
		queryKey: notificationListPrefix(orgId),
	});
	const pageCount = first?.[1]?.pages[0]?.unread;
	return typeof pageCount === "number" ? pageCount : undefined;
};

const applyUnreadCount = (
	queryClient: QueryClient,
	orgId: string,
	unread: number,
) => {
	queryClient.setQueryData<NotificationUnreadCountDto>(
		notificationsUnreadCountKey(orgId),
		{ unread },
	);
	updateNotificationLists(queryClient, orgId, (data) =>
		data.pages.every((page) => page.unread === unread)
			? data
			: {
					...data,
					pages: data.pages.map((page) =>
						page.unread === unread ? page : { ...page, unread },
					),
				},
	);
};

const findNotification = (
	queryClient: QueryClient,
	orgId: string,
	notificationId: string,
): NotificationDto | undefined => {
	for (const [, data] of queryClient.getQueriesData<NotificationListData>({
		queryKey: notificationListPrefix(orgId),
	})) {
		for (const page of data?.pages ?? []) {
			const found = page.items.find((item) => item.id === notificationId);
			if (found) {
				return found;
			}
		}
	}
	return undefined;
};

const applyReadAt = (
	data: NotificationListData,
	notificationId: string,
	readAt: string,
): NotificationListData => {
	let changed = false;
	const pages = data.pages.map((page) => {
		let pageChanged = false;
		const items = page.items.map((item) => {
			if (item.id !== notificationId || item.readAt === readAt) {
				return item;
			}
			pageChanged = true;
			return { ...item, readAt };
		});
		if (!pageChanged) {
			return page;
		}
		changed = true;
		return { ...page, items };
	});
	return changed ? { ...data, pages } : data;
};

const removeNotification = (
	data: NotificationListData,
	notificationId: string,
): NotificationListData => {
	let removed = false;
	const pages = data.pages.map((page) => {
		const items = page.items.filter((item) => item.id !== notificationId);
		if (items.length === page.items.length) {
			return page;
		}
		removed = true;
		return { ...page, items };
	});
	if (!removed) {
		return data;
	}
	// Every page carries the same global total, so decrement it once for all.
	const total = Math.max(0, (data.pages[0]?.total ?? 0) - 1);
	return {
		...data,
		pages: pages.map((page) =>
			page.total === total ? page : { ...page, total },
		),
	};
};

const markAllReadLocally = (
	data: NotificationListData,
	filter: NotificationFilter,
	readAt: string,
): NotificationListData => ({
	...data,
	pages: data.pages.map((page) => ({
		...page,
		unread: 0,
		total: filter === "unread" ? 0 : page.total,
		items:
			filter === "unread"
				? []
				: page.items.map((item) => (item.readAt ? item : { ...item, readAt })),
	})),
});

/**
 * The optimistic pages stay usable without refetching. They are marked stale
 * rather than refetched: under the unread filter a locally removed row can
 * shift the server offset until the next mount/focus reconciles, which is
 * preferable to blanking the list on every read. The counter is refetched
 * because it is not paginated.
 */
const markNotificationCachesStale = (
	queryClient: QueryClient,
	orgId: string,
) => {
	void queryClient.invalidateQueries({
		queryKey: notificationsRootKey(orgId),
		refetchType: "none",
	});
	void queryClient.invalidateQueries({
		queryKey: notificationsUnreadCountKey(orgId),
	});
};

export function useMarkNotificationRead(
	orgId: string,
	callbacks?: OptimisticMutationCallbacks<
		Awaited<ReturnType<typeof markNotificationRead>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useOptimisticMutation({
		mutationFn: (notificationId: string) =>
			markNotificationRead(orgId, notificationId),
		optimistic: (notificationId) => {
			const existing = findNotification(queryClient, orgId, notificationId);
			if (!existing || existing.readAt) {
				return [];
			}
			const readAt = new Date().toISOString();
			const unread = readUnreadCount(queryClient, orgId);
			const nextUnread =
				unread === undefined ? undefined : Math.max(0, unread - 1);
			return [
				...notificationListPatches(
					queryClient,
					orgId,
					(data, filter) =>
						filter === "unread"
							? removeNotification(data, notificationId)
							: applyReadAt(data, notificationId, readAt),
					nextUnread,
				),
				...unreadCounterPatches(queryClient, orgId, nextUnread),
			];
		},
		// The optimistic pages stay usable without refetching (and without
		// offset drift). On success, reconcile with the timestamp the server
		// persisted; in every case mark the pages stale and refresh the counter.
		invalidate: (client, _notificationId, data) => {
			if (data) {
				updateNotificationLists(client, orgId, (list, filter) =>
					filter === "unread" ? list : applyReadAt(list, data.id, data.readAt),
				);
			}
			markNotificationCachesStale(client, orgId);
		},
		callbacks,
	});
}

export function useMarkAllNotificationsRead(
	orgId: string,
	callbacks?: OptimisticMutationCallbacks<
		Awaited<ReturnType<typeof markAllNotificationsRead>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useOptimisticMutation({
		mutationFn: () => markAllNotificationsRead(orgId),
		optimistic: () => {
			const readAt = new Date().toISOString();
			return [
				...notificationListPatches(
					queryClient,
					orgId,
					(data, filter) => markAllReadLocally(data, filter, readAt),
					0,
				),
				...unreadCounterPatches(queryClient, orgId, 0),
			];
		},
		invalidate: (client, _variables, data) => {
			if (data) {
				applyUnreadCount(client, orgId, data.unread);
			}
			markNotificationCachesStale(client, orgId);
		},
		callbacks,
	});
}

export function useArchiveNotification(
	orgId: string,
	callbacks?: OptimisticMutationCallbacks<
		Awaited<ReturnType<typeof archiveNotification>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useOptimisticMutation({
		mutationFn: (notificationId: string) =>
			archiveNotification(orgId, notificationId),
		optimistic: (notificationId) => {
			const existing = findNotification(queryClient, orgId, notificationId);
			if (!existing) {
				return [];
			}
			const unread = existing.readAt
				? undefined
				: readUnreadCount(queryClient, orgId);
			const nextUnread =
				unread === undefined ? undefined : Math.max(0, unread - 1);
			return [
				...notificationListPatches(
					queryClient,
					orgId,
					(data) => removeNotification(data, notificationId),
					nextUnread,
				),
				...unreadCounterPatches(queryClient, orgId, nextUnread),
			];
		},
		invalidate: (client) => markNotificationCachesStale(client, orgId),
		callbacks,
	});
}

/** Deep link to the related comment on the issue detail page. */
export function notificationHash(
	notification: Pick<NotificationDto, "commentId">,
): string | undefined {
	return notification.commentId
		? `comment-${notification.commentId}`
		: undefined;
}

export function issueSubscriptionQuery(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return queryOptions({
		queryKey: issueSubscriptionKey(orgId, projectId, issueNumber),
		queryFn: (): Promise<IssueSubscriptionDto> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].subscription.$get({
					param: { orgId, projectId, number: String(issueNumber) },
				}),
			),
	});
}

export const updateIssueSubscription = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	input: UpdateIssueSubscriptionInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].subscription.$put({
			param: { orgId, projectId, number: String(issueNumber) },
			json: input,
		}),
	);

export function useUpdateIssueSubscription(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: OptimisticMutationCallbacks<
		Awaited<ReturnType<typeof updateIssueSubscription>>,
		UpdateIssueSubscriptionInput
	>,
) {
	const queryKey = issueSubscriptionKey(orgId, projectId, issueNumber);

	return useOptimisticMutation({
		mutationFn: (input: UpdateIssueSubscriptionInput) =>
			updateIssueSubscription(orgId, projectId, issueNumber, input),
		optimistic: (input) =>
			optimisticPatch<IssueSubscriptionDto>(queryKey, (old) =>
				old
					? {
							...old,
							subscribed: input.subscribed,
							muted: input.subscribed ? (input.muted ?? old.muted) : false,
						}
					: old,
			),
		invalidate: (client) => client.invalidateQueries({ queryKey }),
		callbacks,
	});
}
