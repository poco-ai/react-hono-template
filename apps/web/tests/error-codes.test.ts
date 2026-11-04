import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiErrorCode } from "@workspace/shared";
import { apiErrorMessage, codedError } from "../src/lib/errors";

// Identity translator: the resolved key proves which copy a code selects.
const t = ((key: string) => key) as never;

const message = (code: string) =>
	apiErrorMessage(t, codedError("failed", code));

test("issue hierarchy and relation codes map to dedicated copy", () => {
	for (const code of [
		ApiErrorCode.ISSUE_PARENT_INVALID,
		ApiErrorCode.ISSUE_PARENT_DEPTH,
		ApiErrorCode.ISSUE_RELATION_INVALID,
		ApiErrorCode.ISSUE_RELATION_EXISTS,
		ApiErrorCode.ISSUE_RELATION_CYCLE,
		ApiErrorCode.PROJECT_ARCHIVED,
		ApiErrorCode.STATUS_NAME_TAKEN,
		ApiErrorCode.STATUS_LAST_STATUS,
		ApiErrorCode.STATUS_MIGRATION_REQUIRED,
		ApiErrorCode.STATUS_MIGRATION_INVALID,
		ApiErrorCode.CYCLE_OVERLAP,
		ApiErrorCode.CYCLE_RANGE_INVALID,
		ApiErrorCode.CYCLE_TARGET_INVALID,
		ApiErrorCode.VIEW_LIMIT_REACHED,
		ApiErrorCode.VIEW_NOT_FOUND,
	]) {
		assert.equal(message(code), `errors.codes.${code}`);
	}
});

test("not-found suffixes and unknown codes fall back predictably", () => {
	assert.equal(message("CYCLE_NOT_FOUND"), "errors.codes.NOT_FOUND");
	assert.equal(message("UNMAPPED_CODE"), "errors.generic");
	assert.equal(
		apiErrorMessage(t, new Error("network"), "errors.codes.VALIDATION"),
		"errors.codes.VALIDATION",
	);
});
