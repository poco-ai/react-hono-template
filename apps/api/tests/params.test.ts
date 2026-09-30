import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import {
	requireIssueNumber,
	requireParam,
	requireProjectId,
} from "../src/lib/params";

// These helpers only read `c.req.param`, so a minimal stand-in is enough.
const contextWith = (params: Record<string, string | undefined>) =>
	({
		req: { param: (name: string) => params[name] },
	}) as unknown as Context;

const invalidParam = (message: string) => (error: unknown) =>
	error instanceof ApiError &&
	error.status === 400 &&
	error.code === ApiErrorCode.INVALID_PARAM &&
	error.message === message;

test("requireParam returns present params and rejects missing or empty ones", () => {
	assert.equal(
		requireParam(contextWith({ projectId: "p1" }), "projectId"),
		"p1",
	);
	assert.equal(requireProjectId(contextWith({ projectId: "p1" })), "p1");
	for (const params of [{}, { projectId: "" }]) {
		assert.throws(
			() => requireParam(contextWith(params), "projectId"),
			invalidParam("Missing required param: projectId"),
		);
		assert.throws(
			() => requireProjectId(contextWith(params)),
			invalidParam("Missing required param: projectId"),
		);
	}
});

test("requireIssueNumber parses positive integers", () => {
	for (const [raw, expected] of [
		["1", 1],
		["42", 42],
		["007", 7],
	] as const) {
		assert.equal(requireIssueNumber(contextWith({ number: raw })), expected);
	}
});

test("requireIssueNumber rejects zero, negatives, fractions and non-numerics", () => {
	const message = "Issue number must be a positive integer";
	for (const raw of ["0", "-1", "1.5", "abc", "", " 42", undefined]) {
		assert.throws(
			() => requireIssueNumber(contextWith({ number: raw })),
			invalidParam(message),
		);
	}
});
