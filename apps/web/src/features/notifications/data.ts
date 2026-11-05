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
	type QueryKey,
	queryOptions,
	useMutation,
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
import type { MutationCallbacks } from "@/lib/mutation-callbacks";
import { optimisticUpdate, rollbackOptimistic } from "@/lib/optimistic";

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
		getNextPageParam: (lastPage) =>
			lastPage.page * lastPage.pageSize < lastPage.total
				? lastPage.page + 1
				: undefined,
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

type NotificationCacheSnapshot = {
	lists: Array<[QueryKey, NotificationListData | undefined]>;
	unread: NotificationUnreadCountDto | undefined;
};

const notificationListPrefix = (orgId: string) =>
	[...notificationsRootKey(orgId), "list"] as const;

const snapshotNotificationCaches = (
	queryClient: QueryClient,
	orgId: string,
): NotificationCacheSnapshot => ({
	lists: queryClient.getQueriesData<NotificationListData>({
		queryKey: notificationListPrefix(orgId),
	}),
	unread: queryClient.getQueryData<NotificationUnreadCountDto>(
		notificationsUnreadCountKey(orgId),
	),
});

const restoreNotificationCaches = (
	queryClient: QueryClient,
	orgId: string,
	snapshot: NotificationCacheSnapshot | undefined,
) => {
	if (!snapshot) {
		return;
	}
	for (const [key, data] of snapshot.lists) {
		if (data) {
			queryClient.setQueryData(key, data);
		}
	}
	if (snapshot.unread) {
		queryClient.setQueryData(
			notificationsUnreadCountKey(orgId),
			snapshot.unread,
		);
	} else {
		queryClient.removeQueries({
			queryKey: notificationsUnreadCountKey(orgId),
			exact: true,
		});
	}
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
 * The optimistic pages stay usable without refetching (and without offset
 * drift). Mark them stale so the next mount/focus reconciles with the server,
 * and refresh only the counter, which is not paginated.
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
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof markNotificationRead>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (notificationId: string) =>
			markNotificationRead(orgId, notificationId),
		onMutate: async (notificationId) => {
			await queryClient.cancelQueries({
				queryKey: notificationsRootKey(orgId),
			});
			const snapshot = snapshotNotificationCaches(queryClient, orgId);
			const existing = findNotification(queryClient, orgId, notificationId);
			if (!existing || existing.readAt) {
				return snapshot;
			}
			updateNotificationLists(queryClient, orgId, (data, filter) =>
				filter === "unread"
					? removeNotification(data, notificationId)
					: applyReadAt(data, notificationId, new Date().toISOString()),
			);
			const unread = readUnreadCount(queryClient, orgId);
			if (unread !== undefined) {
				applyUnreadCount(queryClient, orgId, Math.max(0, unread - 1));
			}
			return snapshot;
		},
		onError: (error, notificationId, result, context) => {
			restoreNotificationCaches(queryClient, orgId, result);
			return callbacks?.onError?.(error, notificationId, result, context);
		},
		onSuccess: (data, _notificationId, _result, context) => {
			// Reconcile with the timestamp the server persisted.
			updateNotificationLists(queryClient, orgId, (list, filter) =>
				filter === "unread" ? list : applyReadAt(list, data.id, data.readAt),
			);
			return callbacks?.onSuccess?.(data, _notificationId, _result, context);
		},
		onSettled: (...args) => {
			markNotificationCachesStale(queryClient, orgId);
			return callbacks?.onSettled?.(...args);
		},
	});
}

export function useMarkAllNotificationsRead(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof markAllNotificationsRead>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => markAllNotificationsRead(orgId),
		onMutate: async () => {
			await queryClient.cancelQueries({
				queryKey: notificationsRootKey(orgId),
			});
			const snapshot = snapshotNotificationCaches(queryClient, orgId);
			const readAt = new Date().toISOString();
			updateNotificationLists(queryClient, orgId, (data, filter) =>
				markAllReadLocally(data, filter, readAt),
			);
			applyUnreadCount(queryClient, orgId, 0);
			return snapshot;
		},
		onError: (error, variables, result, context) => {
			restoreNotificationCaches(queryClient, orgId, result);
			return callbacks?.onError?.(error, variables, result, context);
		},
		onSuccess: (data, _variables, _result, context) => {
			applyUnreadCount(queryClient, orgId, data.unread);
			return callbacks?.onSuccess?.(data, _variables, _result, context);
		},
		onSettled: (...args) => {
			markNotificationCachesStale(queryClient, orgId);
			return callbacks?.onSettled?.(...args);
		},
	});
}

export function useArchiveNotification(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof archiveNotification>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (notificationId: string) =>
			archiveNotification(orgId, notificationId),
		onMutate: async (notificationId) => {
			await queryClient.cancelQueries({
				queryKey: notificationsRootKey(orgId),
			});
			const snapshot = snapshotNotificationCaches(queryClient, orgId);
			const existing = findNotification(queryClient, orgId, notificationId);
			if (!existing) {
				return snapshot;
			}
			updateNotificationLists(queryClient, orgId, (data) =>
				removeNotification(data, notificationId),
			);
			if (!existing.readAt) {
				const unread = readUnreadCount(queryClient, orgId);
				if (unread !== undefined) {
					applyUnreadCount(queryClient, orgId, Math.max(0, unread - 1));
				}
			}
			return snapshot;
		},
		onError: (error, notificationId, result, context) => {
			restoreNotificationCaches(queryClient, orgId, result);
			return callbacks?.onError?.(error, notificationId, result, context);
		},
		onSettled: (...args) => {
			markNotificationCachesStale(queryClient, orgId);
			return callbacks?.onSettled?.(...args);
		},
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
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateIssueSubscription>>,
		UpdateIssueSubscriptionInput
	>,
) {
	const queryClient = useQueryClient();
	const queryKey = issueSubscriptionKey(orgId, projectId, issueNumber);

	return useMutation({
		...callbacks,
		mutationFn: (input: UpdateIssueSubscriptionInput) =>
			updateIssueSubscription(orgId, projectId, issueNumber, input),
		onMutate: (input) =>
			optimisticUpdate<IssueSubscriptionDto>(queryClient, queryKey, (old) =>
				old
					? {
							...old,
							subscribed: input.subscribed,
							muted: input.subscribed ? (input.muted ?? old.muted) : false,
						}
					: old,
			),
		onError: (error, input, result, context) => {
			rollbackOptimistic(queryClient, queryKey, result);
			return callbacks?.onError?.(error, input, result, context);
		},
		onSettled: (...args) => {
			void queryClient.invalidateQueries({ queryKey });
			return callbacks?.onSettled?.(...args);
		},
	});
}
