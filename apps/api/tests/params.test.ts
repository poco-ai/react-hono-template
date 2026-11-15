import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	FAVORITE_ENTITY_TYPES,
} from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
	favoriteParams,
	ISSUE_NUMBER_MESSAGE,
	issueNumberParam,
	issueParams,
} from "../src/lib/params";
import { validate } from "../src/lib/validation";

const app = () => {
	const hono = new Hono();
	hono.onError((err, c) =>
		err instanceof ApiError
			? c.json(
					{ error: { code: err.code, message: err.message } },
					err.status as ContentfulStatusCode,
				)
			: c.json(
					{ error: { code: "INTERNAL_ERROR", message: String(err) } },
					500,
				),
	);
	return hono
		.get(
			"/orgs/:orgId/projects/:projectId/issues/:number",
			validate(issueParams, "param"),
			(c) => c.json({ data: c.req.valid("param") }),
		)
		.delete(
			"/orgs/:orgId/favorites/:entityType/:entityId",
			validate(favoriteParams, "param"),
			(c) => c.json({ data: c.req.valid("param") }),
		)
		.post("/body", validate(issueParams, "json"), (c) =>
			c.json({ data: c.req.valid("json") }),
		);
};

const expectParamError = async (response: Response, message: string) => {
	assert.equal(response.status, 400);
	const body = (await response.json()) as {
		error: { code: string; message: string };
	};
	assert.equal(body.error.code, ApiErrorCode.INVALID_PARAM);
	assert.equal(body.error.message, message);
};

test("issue number params parse positive integers with leading zeros", () => {
	for (const [raw, expected] of [
		["1", 1],
		["42", 42],
		["007", 7],
	] as const) {
		assert.equal(issueNumberParam.parse(raw), expected);
		assert.deepEqual(
			issueParams.parse({ orgId: "o1", projectId: "p1", number: raw }),
			{ orgId: "o1", projectId: "p1", number: expected },
		);
	}
});

test("issue number params reject zero, negatives, fractions and non-numerics", () => {
	for (const raw of ["0", "-1", "1.5", "abc", "", " 42", "1e3"]) {
		const result = issueNumberParam.safeParse(raw);
		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.error.issues[0]?.message, ISSUE_NUMBER_MESSAGE);
		}
	}
});

test("issue params require a non-empty project id", () => {
	const result = issueParams.safeParse({
		orgId: "o1",
		projectId: "",
		number: "1",
	});
	assert.equal(result.success, false);
	if (!result.success) {
		assert.equal(result.error.issues[0]?.path.join("."), "projectId");
	}
});

test("favorite params only accept known entity types", () => {
	for (const entityType of FAVORITE_ENTITY_TYPES) {
		assert.deepEqual(
			favoriteParams.parse({ orgId: "o1", entityType, entityId: "x1" }),
			{ orgId: "o1", entityType, entityId: "x1" },
		);
	}
	const invalid = favoriteParams.safeParse({
		orgId: "o1",
		entityType: "comment",
		entityId: "c1",
	});
	assert.equal(invalid.success, false);
});

test("param validation middleware returns parsed values with INVALID_PARAM", async () => {
	const response = await app().request("/orgs/o1/projects/p1/issues/007");
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		data: { orgId: "o1", projectId: "p1", number: 7 },
	});

	await expectParamError(
		await app().request("/orgs/o1/projects/p1/issues/abc"),
		`number: ${ISSUE_NUMBER_MESSAGE}`,
	);

	const invalidType = favoriteParams.safeParse({
		orgId: "o1",
		entityType: "comment",
		entityId: "c1",
	});
	assert.equal(invalidType.success, false);
	await expectParamError(
		await app().request("/orgs/o1/favorites/comment/c1", { method: "DELETE" }),
		`entityType: ${invalidType.success ? "" : (invalidType.error.issues[0]?.message ?? "")}`,
	);
});

test("json validation keeps the VALIDATION error code", async () => {
	const response = await app().request("/body", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ projectId: "p1", number: "abc" }),
	});
	assert.equal(response.status, 400);
	const body = (await response.json()) as { error: { code: string } };
	assert.equal(body.error.code, ApiErrorCode.VALIDATION);
});
