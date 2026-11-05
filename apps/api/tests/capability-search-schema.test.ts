import assert from "node:assert/strict";
import { test } from "node:test";
// Two schemas deliberately share a name but not a purpose:
// - strict: capability/MCP output contract (fails on missing fields)
// - lenient: web command-palette parser (fills defaults, drops bad hits)
import { searchResultsSchema as lenientSearchResultsSchema } from "@workspace/shared";
import { searchResultsSchema as strictSearchResultsSchema } from "../src/capabilities/projections";

const NOW = "2026-01-01T00:00:00.000Z";

/** Complete, well-formed `search_all` payload as the service emits it. */
const fullSearchResponse = () => ({
	issues: [
		{
			id: "issue-1",
			projectId: "project-1",
			projectKey: "WEB",
			number: 12,
			identifier: "WEB-12",
			title: "Login fails",
			descriptionExcerpt: "Steps to reproduce",
			statusId: "status-todo",
			statusName: "Todo",
			statusColor: "#3b82f6",
			statusCategory: "unstarted",
			priority: 2,
			assignee: { id: "user-1", name: "Ada", image: null },
			updatedAt: NOW,
		},
	],
	comments: [
		{
			id: "comment-1",
			body: "Reproduced on staging",
			author: { id: "user-1", name: "Ada", image: null },
			issue: {
				id: "issue-1",
				projectId: "project-1",
				projectKey: "WEB",
				number: 12,
				identifier: "WEB-12",
				title: "Login fails",
			},
			createdAt: NOW,
		},
	],
	projects: [
		{
			id: "project-1",
			name: "Website",
			key: "WEB",
			descriptionExcerpt: null,
			color: "#6366f1",
			archived: false,
			updatedAt: NOW,
		},
	],
	members: [{ id: "user-1", name: "Ada", image: null }],
});

test("strict and lenient search schemas agree on a complete response", () => {
	const payload = fullSearchResponse();

	const strict = strictSearchResultsSchema.safeParse(payload);
	assert.equal(
		strict.success,
		true,
		strict.success ? "" : strict.error.message,
	);
	const lenient = lenientSearchResultsSchema.safeParse(payload);
	assert.equal(
		lenient.success,
		true,
		lenient.success ? "" : lenient.error.message,
	);

	// Same field set and values: the two definitions have not drifted.
	if (strict.success && lenient.success) {
		assert.deepEqual(strict.data, lenient.data);
		assert.deepEqual(strict.data, payload);
	}
});

test("strict search schema rejects the partial payload the lenient one fills", () => {
	// A hit that lost most of its presentation fields. The capability contract
	// must fail (so the executor reports an invalid payload), while the palette
	// parser is documented to recover with fallbacks.
	const partial = {
		issues: [
			{
				id: "issue-2",
				projectId: "project-1",
				projectKey: "WEB",
				number: 13,
				title: "Partial hit",
			},
		],
		comments: [],
		projects: [],
		members: [],
	};

	assert.equal(strictSearchResultsSchema.safeParse(partial).success, false);

	const lenient = lenientSearchResultsSchema.parse(partial);
	assert.deepEqual(lenient.issues, [
		{
			id: "issue-2",
			projectId: "project-1",
			projectKey: "WEB",
			number: 13,
			title: "Partial hit",
			identifier: "WEB-13",
			descriptionExcerpt: null,
			statusId: "",
			statusName: "",
			statusColor: "",
			statusCategory: "unstarted",
			priority: 0,
			assignee: null,
			updatedAt: "",
		},
	]);
});

type SearchPayload = {
	issues: Record<string, unknown>[];
	comments: Record<string, unknown>[];
	projects: Record<string, unknown>[];
	members: Record<string, unknown>[];
};

const payloadWith = (
	section: keyof SearchPayload,
	item: Record<string, unknown>,
): SearchPayload => {
	const payload = fullSearchResponse() as unknown as SearchPayload;
	return { ...payload, [section]: [item] };
};

const withoutField = <T extends Record<string, unknown>>(
	value: T,
	key: string,
) => {
	const copy = { ...value };
	delete copy[key];
	return copy;
};

test("strict search schema requires every documented field", () => {
	const base = fullSearchResponse() as unknown as SearchPayload;

	for (const key of [
		"id",
		"projectId",
		"projectKey",
		"number",
		"identifier",
		"title",
		"descriptionExcerpt",
		"statusId",
		"statusName",
		"statusColor",
		"statusCategory",
		"priority",
		"assignee",
		"updatedAt",
	]) {
		const payload = payloadWith("issues", withoutField(base.issues[0], key));
		assert.equal(
			strictSearchResultsSchema.safeParse(payload).success,
			false,
			`issue.${key}`,
		);
	}

	for (const key of ["id", "body", "author", "issue", "createdAt"]) {
		const payload = payloadWith(
			"comments",
			withoutField(base.comments[0], key),
		);
		assert.equal(
			strictSearchResultsSchema.safeParse(payload).success,
			false,
			`comment.${key}`,
		);
	}

	const commentIssue = base.comments[0].issue as Record<string, unknown>;
	for (const key of [
		"id",
		"projectId",
		"projectKey",
		"number",
		"identifier",
		"title",
	]) {
		const payload = payloadWith("comments", {
			...base.comments[0],
			issue: withoutField(commentIssue, key),
		});
		assert.equal(
			strictSearchResultsSchema.safeParse(payload).success,
			false,
			`comment.issue.${key}`,
		);
	}

	for (const key of [
		"id",
		"name",
		"key",
		"descriptionExcerpt",
		"color",
		"archived",
		"updatedAt",
	]) {
		const payload = payloadWith(
			"projects",
			withoutField(base.projects[0], key),
		);
		assert.equal(
			strictSearchResultsSchema.safeParse(payload).success,
			false,
			`project.${key}`,
		);
	}

	for (const key of ["id", "name", "image"]) {
		const payload = payloadWith("members", withoutField(base.members[0], key));
		assert.equal(
			strictSearchResultsSchema.safeParse(payload).success,
			false,
			`member.${key}`,
		);
	}
});
