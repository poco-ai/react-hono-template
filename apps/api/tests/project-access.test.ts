import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { assertProjectWritable } from "../src/features/projects/services/project-access";

test("missing projects are NOT_FOUND and archived projects are read-only", () => {
	assert.throws(
		() => assertProjectWritable(null),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.PROJECT_NOT_FOUND,
	);
	assert.throws(
		() => assertProjectWritable({ archived: true }),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.PROJECT_ARCHIVED,
	);
	assert.equal(assertProjectWritable({ archived: false }).archived, false);
});
