import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPageParam, pageCount } from "../src/lib/pagination";

/**
 * Shared pagination arithmetic: list footers and infinite queries must agree
 * on how many pages an envelope has and when "load more" stops.
 */

test("pageCount never drops below one page", () => {
	assert.equal(pageCount({ total: 0, pageSize: 20 }), 1);
	assert.equal(pageCount({ total: 1, pageSize: 20 }), 1);
	assert.equal(pageCount({ total: 20, pageSize: 20 }), 1);
	assert.equal(pageCount({ total: 21, pageSize: 20 }), 2);
	assert.equal(pageCount({ total: 40, pageSize: 20 }), 2);
	assert.equal(pageCount({ total: 41, pageSize: 20 }), 3);
	assert.equal(pageCount({ total: 100, pageSize: 10 }), 10);
	assert.equal(pageCount({ total: 101, pageSize: 10 }), 11);
});

test("pageCount matches the previous max(1, ceil(total / pageSize))", () => {
	for (const pageSize of [1, 10, 20, 50, 100]) {
		for (const total of [0, 1, 9, 10, 11, 99, 100, 101, 250]) {
			assert.equal(
				pageCount({ total, pageSize }),
				Math.max(1, Math.ceil(total / pageSize)),
			);
		}
	}
});

test("nextPageParam advances until the last page", () => {
	assert.equal(nextPageParam({ page: 1, total: 0, pageSize: 20 }), undefined);
	assert.equal(nextPageParam({ page: 1, total: 20, pageSize: 20 }), undefined);
	assert.equal(nextPageParam({ page: 1, total: 21, pageSize: 20 }), 2);
	assert.equal(nextPageParam({ page: 2, total: 21, pageSize: 20 }), undefined);
	assert.equal(nextPageParam({ page: 2, total: 60, pageSize: 20 }), 3);
	assert.equal(nextPageParam({ page: 3, total: 60, pageSize: 20 }), undefined);
});

test("nextPageParam stops for a page past the end", () => {
	// A page beyond the count must not keep requesting more pages.
	assert.equal(nextPageParam({ page: 5, total: 21, pageSize: 20 }), undefined);
	assert.equal(nextPageParam({ page: 2, total: 0, pageSize: 20 }), undefined);
});

test("nextPageParam matches the legacy page * pageSize < total rule", () => {
	for (const pageSize of [10, 20]) {
		for (const total of [0, 1, 19, 20, 21, 40, 41]) {
			for (const page of [1, 2, 3, 4]) {
				assert.equal(
					nextPageParam({ page, total, pageSize }),
					page * pageSize < total ? page + 1 : undefined,
					`page=${page} total=${total} pageSize=${pageSize}`,
				);
			}
		}
	}
});
