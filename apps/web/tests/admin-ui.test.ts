import assert from "node:assert/strict";
import { test } from "node:test";
import { adminUsersSearchSchema } from "../src/features/admin/search";

test("admin user filters and pagination survive URL round trips", () => {
	const search = {
		page: "3",
		search: "Alice",
		field: "name",
		operator: "starts_with",
		status: "banned",
		sort: "name",
		direction: "asc",
	};
	const parsed = adminUsersSearchSchema.parse(
		Object.fromEntries(new URLSearchParams(search)),
	);
	assert.deepEqual(parsed, { ...search, page: 3 });
	assert.deepEqual(
		adminUsersSearchSchema.parse({
			page: "bad",
			field: "unknown",
			operator: "raw",
			status: "unknown",
			sort: "secret",
			direction: "unknown",
		}),
		{
			page: 1,
			field: "email",
			operator: "contains",
			status: "all",
			sort: "createdAt",
			direction: "desc",
		},
	);
});
