import { z } from "zod";

/**
 * Shared pagination query primitives.
 *
 * Resource list schemas spread `paginationQueryShape(defaultPageSize)` so the
 * `page`/`pageSize` validation stays identical everywhere; only the historical
 * `pageSize` defaults (10/20/50) differ per endpoint and stay explicit at each
 * call site.
 */

const PAGE_QUERY_MAX = 10000;

const PAGE_SIZE_QUERY_MAX = 100;

export const paginationQueryShape = (pageSizeDefault: number) => ({
	page: z.coerce.number().int().min(1).max(PAGE_QUERY_MAX).default(1),
	pageSize: z.coerce
		.number()
		.int()
		.min(1)
		.max(PAGE_SIZE_QUERY_MAX)
		.default(pageSizeDefault),
});

/** Envelope shared by every paginated list response. */
export type Paginated<T> = {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
};
