import type {
	CommentDto,
	ListCommentsDto,
} from "@api/features/comments/dto/comment.dto";
import type {
	InfiniteData,
	UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/** Stop expanding a deep link after this many pages to bound requests. */
const DEEP_LINK_MAX_PAGES = 6;
const COMMENT_HASH_PREFIX = "comment-";
/** How long a jump target stays highlighted. */
const HIGHLIGHT_MS = 2200;

const commentIdFromHash = (hash: string) => {
	const value = hash.replace(/^#/, "");
	if (!value.startsWith(COMMENT_HASH_PREFIX)) {
		return null;
	}
	const id = value.slice(COMMENT_HASH_PREFIX.length);
	return id.length > 0 ? id : null;
};

type CommentPagesQuery = UseInfiniteQueryResult<
	InfiniteData<ListCommentsDto>,
	Error
>;

/**
 * Scrolls to a comment and briefly highlights it. Sources are
 * notifications (`#comment-<id>` deep links) and freshly posted comments;
 * either may live on a page that is not loaded yet, so the target keeps
 * paging until it appears (bounded by `DEEP_LINK_MAX_PAGES`).
 */
export function useCommentDeepLink({
	query,
	comments,
}: {
	query: CommentPagesQuery;
	comments: readonly CommentDto[];
}) {
	const location = useLocation();
	const [scrollTarget, setScrollTarget] = useState<{
		id: string;
		deepLink: boolean;
	} | null>(null);
	const [highlightedId, setHighlightedId] = useState<string | null>(null);
	const [deepLinkMissing, setDeepLinkMissing] = useState(false);

	const {
		fetchNextPage,
		hasNextPage,
		isFetching: commentsFetching,
		isFetchNextPageError,
		isFetchingNextPage,
		isPending: commentsPending,
	} = query;
	const loadedPages = query.data?.pages.length ?? 0;

	useEffect(() => {
		const id = commentIdFromHash(location.hash);
		if (!id) {
			setDeepLinkMissing(false);
			return;
		}
		setDeepLinkMissing(false);
		setScrollTarget({ id, deepLink: true });
	}, [location.hash]);

	useEffect(() => {
		if (!scrollTarget) {
			return;
		}
		const element = comments.some((comment) => comment.id === scrollTarget.id)
			? document.getElementById(`comment-${scrollTarget.id}`)
			: null;
		if (element) {
			element.scrollIntoView({ block: "center" });
			setHighlightedId(scrollTarget.id);
			setDeepLinkMissing(false);
			setScrollTarget(null);
			return;
		}
		const canLoadMore =
			Boolean(hasNextPage) && loadedPages < DEEP_LINK_MAX_PAGES;
		// A posted comment is only visible after the invalidation refetch; wait
		// for it instead of racing the fetched pages.
		if (
			canLoadMore &&
			!isFetchingNextPage &&
			!isFetchNextPageError &&
			(scrollTarget.deepLink || !commentsFetching)
		) {
			void fetchNextPage();
			return;
		}
		if (!commentsPending && !isFetchingNextPage && !commentsFetching) {
			if (scrollTarget.deepLink) {
				setDeepLinkMissing(true);
			} else {
				setScrollTarget(null);
			}
		}
	}, [
		scrollTarget,
		comments,
		commentsFetching,
		commentsPending,
		fetchNextPage,
		hasNextPage,
		isFetchNextPageError,
		isFetchingNextPage,
		loadedPages,
	]);

	useEffect(() => {
		if (!highlightedId) {
			return;
		}
		const timer = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
		return () => window.clearTimeout(timer);
	}, [highlightedId]);

	/** Jump to a just-posted comment once the invalidation refetch lands it. */
	const scrollToComment = (id: string, deepLink: boolean) => {
		setDeepLinkMissing(false);
		setScrollTarget({ id, deepLink });
	};

	return { highlightedId, deepLinkMissing, scrollToComment };
}
