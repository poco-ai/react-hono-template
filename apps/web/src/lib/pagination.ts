/**
 * Page arithmetic shared by paged lists and infinite queries. Every paginated
 * API envelope carries `page`/`pageSize`/`total`; keeping the formulas here
 * stops list footers and `getNextPageParam` callbacks from drifting apart.
 */

export interface PageInfo {
	/** 1-based page number; only needed when computing the next page. */
	page?: number;
	pageSize: number;
	total: number;
}

/**
 * Total pages for a paginated response. Never below 1, so an empty list still
 * renders a (disabled) first page instead of collapsing the footer.
 */
export function pageCount({ pageSize, total }: PageInfo): number {
	return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * `getNextPageParam` for page-based infinite queries: the next page while the
 * current one is below the page count, otherwise `undefined` to stop loading.
 */
export function nextPageParam(
	lastPage: PageInfo & { page: number },
): number | undefined {
	return lastPage.page < pageCount(lastPage) ? lastPage.page + 1 : undefined;
}
