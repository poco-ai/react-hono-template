import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	SearchCommentHitDto,
	SearchIssueHitDto,
	SearchProjectHitDto,
} from "../src/features/search/data";
import {
	buildSearchRequest,
	clampSearchLimit,
	commentTarget,
	emptySearchResults,
	issueTarget,
	memberTarget,
	normalizeSearchResults,
	parseRecent,
	projectTarget,
	pushRecent,
	RECENT_LIMIT,
	readRecent,
	recentStorageKey,
	recordRecent,
	searchKey,
	writeRecent,
} from "../src/features/search/data";

const issueHit = (overrides: Partial<SearchIssueHitDto> = {}) => ({
	id: "issue-1",
	projectId: "project-1",
	projectKey: "WEB",
	number: 12,
	identifier: "WEB-12",
	title: "Palette search",
	descriptionExcerpt: null,
	statusId: "status-1",
	statusName: "Todo",
	statusColor: "#3b82f6",
	statusCategory: "unstarted",
	priority: 2,
	assignee: null,
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const commentHit = (overrides: Partial<SearchCommentHitDto> = {}) => ({
	id: "comment-1",
	body: "Looks good",
	author: { id: "user-1", name: "Ada", image: null },
	issue: {
		id: "issue-1",
		projectId: "project-1",
		projectKey: "WEB",
		number: 12,
		identifier: "WEB-12",
		title: "Palette search",
	},
	createdAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const projectHit = (overrides: Partial<SearchProjectHitDto> = {}) => ({
	id: "project-1",
	name: "Website",
	key: "WEB",
	descriptionExcerpt: null,
	color: "#111111",
	archived: false,
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const memoryStore = () => {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
};

test("search parameters trim the term, cap the limit and skip empty input", () => {
	assert.equal(buildSearchRequest("   "), null);
	assert.equal(buildSearchRequest("a".repeat(200))?.q.length, 100);
	assert.deepEqual(buildSearchRequest("  palette  "), {
		q: "palette",
		limit: 8,
	});
	assert.deepEqual(buildSearchRequest("palette", 0), {
		q: "palette",
		limit: 1,
	});
	assert.deepEqual(buildSearchRequest("palette", 99), {
		q: "palette",
		limit: 20,
	});
	assert.equal(clampSearchLimit(Number.NaN), 8);
	assert.deepEqual(searchKey("org-1", null), [
		"orgs",
		"org-1",
		"search",
		"",
		8,
	]);
	assert.deepEqual(searchKey("org-1", { q: "web", limit: 3 }), [
		"orgs",
		"org-1",
		"search",
		"web",
		3,
	]);
});

test("normalization drops malformed sections and rows", () => {
	assert.deepEqual(normalizeSearchResults(null), {
		issues: [],
		comments: [],
		projects: [],
		members: [],
	});
	assert.deepEqual(normalizeSearchResults("oops"), {
		issues: [],
		comments: [],
		projects: [],
		members: [],
	});
	const normalized = normalizeSearchResults({
		issues: [issueHit(), { id: "broken" }, null],
		comments: [commentHit(), { id: "comment-2", body: "no issue" }],
		projects: [projectHit(), { name: "Missing key id" }],
		members: [{ id: "user-1", name: "Ada", image: null }, { id: "user-2" }],
	});
	assert.equal(normalized.issues.length, 1);
	assert.equal(normalized.issues[0].identifier, "WEB-12");
	assert.equal(normalized.comments.length, 1);
	assert.equal(normalized.comments[0].issue.projectId, "project-1");
	assert.equal(normalized.projects.length, 1);
	assert.equal(normalized.members.length, 1);
	assert.equal(normalized.members[0].name, "Ada");

	// Excerpts explain why a description-only match was returned.
	const excerpted = normalizeSearchResults({
		issues: [issueHit({ descriptionExcerpt: "matched description" })],
		projects: [projectHit({ descriptionExcerpt: "matched project body" })],
	});
	assert.equal(excerpted.issues[0].descriptionExcerpt, "matched description");
	assert.equal(
		excerpted.projects[0].descriptionExcerpt,
		"matched project body",
	);
});

test("normalization fills identifiers and clamps unknown status categories", () => {
	const normalized = normalizeSearchResults({
		issues: [
			issueHit({ identifier: "", statusCategory: "nonsense", number: 4 }),
		],
	});
	assert.equal(normalized.issues[0].identifier, "WEB-4");
	assert.equal(normalized.issues[0].statusCategory, "unstarted");
});

test("normalization treats non-object payloads and non-array sections as empty", () => {
	assert.deepEqual(normalizeSearchResults([]), emptySearchResults());
	assert.deepEqual(normalizeSearchResults(42), emptySearchResults());
	assert.deepEqual(normalizeSearchResults(undefined), emptySearchResults());
	assert.deepEqual(
		normalizeSearchResults({
			issues: "oops",
			comments: null,
			projects: { id: "project-1" },
			members: 7,
		}),
		emptySearchResults(),
	);
});

test("normalization coerces wire values and degrades optional fields", () => {
	const normalized = normalizeSearchResults({
		issues: [
			{
				...issueHit(),
				number: "12",
				priority: "urgent",
				assignee: { id: "user-1" },
				statusCategory: null,
			},
		],
		comments: [
			{
				...commentHit(),
				author: null,
				issue: { projectId: "project-1", projectKey: "WEB", number: "3" },
			},
		],
		projects: [
			{
				...projectHit(),
				archived: "yes",
				color: "",
				descriptionExcerpt: "",
			},
		],
		members: [{ id: "user-1", name: "Ada", image: "" }],
	});
	const issue = normalized.issues[0];
	assert.equal(issue.number, 12);
	assert.equal(issue.identifier, "WEB-12");
	assert.equal(issue.priority, 0);
	assert.equal(issue.assignee, null);
	assert.equal(issue.statusCategory, "unstarted");

	const comment = normalized.comments[0];
	assert.deepEqual(comment.author, { id: "", name: "", image: null });
	assert.equal(comment.issue.number, 3);
	assert.equal(comment.issue.identifier, "WEB-3");

	const project = normalized.projects[0];
	assert.equal(project.archived, false);
	assert.equal(project.color, null);
	assert.equal(project.descriptionExcerpt, null);
	assert.equal(normalized.members[0].image, null);
});

test("normalization returns independent fallback objects", () => {
	const first = normalizeSearchResults({
		comments: [{ ...commentHit(), author: null }],
	});
	const second = normalizeSearchResults({
		comments: [{ ...commentHit(), author: null }],
	});
	assert.notEqual(first.comments[0].author, second.comments[0].author);
	first.comments[0].author.name = "mutated";
	assert.equal(second.comments[0].author.name, "");
});

test("recent entries de-duplicate, cap and sort newest first", () => {
	let entries = pushRecent(
		[],
		{
			kind: "issue",
			projectId: "project-1",
			issueNumber: 1,
			identifier: "WEB-1",
			title: "One",
			visitedAt: 1,
		},
		3,
	);
	entries = pushRecent(
		entries,
		{
			kind: "project",
			projectId: "project-1",
			name: "Website",
			key: "WEB",
			visitedAt: 2,
		},
		3,
	);
	assert.deepEqual(
		entries.map((entry) => entry.kind),
		["project", "issue"],
	);
	// Re-visiting the same issue moves it to the front without duplicating.
	entries = pushRecent(
		entries,
		{
			kind: "issue",
			projectId: "project-1",
			issueNumber: 1,
			identifier: "WEB-1",
			title: "One (renamed)",
			visitedAt: 3,
		},
		3,
	);
	assert.deepEqual(
		entries.map((entry) => [entry.kind, entry.visitedAt]),
		[
			["issue", 3],
			["project", 2],
		],
	);
	assert.equal(
		pushRecent(
			entries,
			{
				kind: "issue",
				projectId: "project-2",
				issueNumber: 9,
				identifier: "API-9",
				title: "Nine",
				visitedAt: 4,
			},
			2,
		).length,
		2,
	);
});

test("recent history tolerates empty and invalid storage", () => {
	assert.deepEqual(parseRecent(null), []);
	assert.deepEqual(parseRecent("{not json"), []);
	assert.deepEqual(parseRecent({}), []);
	assert.deepEqual(
		parseRecent(
			JSON.stringify([
				{
					kind: "issue",
					projectId: "p",
					issueNumber: 2,
					title: "T",
					visitedAt: 1,
				},
				{ kind: "issue" },
				{ kind: "project", projectId: "p", name: "P", visitedAt: 3 },
				{ kind: "project", projectId: "p", name: "P", visitedAt: 2 },
			]),
		).map((entry) => entry.kind),
		["project", "issue"],
	);

	const store = memoryStore();
	const userId = "user-1";
	assert.deepEqual(readRecent("org-1", userId, store), []);
	const written = recordRecent(
		"org-1",
		userId,
		{
			kind: "issue",
			projectId: "project-1",
			issueNumber: 1,
			identifier: "WEB-1",
			title: "One",
		},
		store,
	);
	assert.equal(written.length, 1);
	assert.equal(readRecent("org-1", userId, store).length, 1);
	assert.deepEqual(readRecent("other-org", userId, store), []);
	store.setItem("search:recent:user-1:org-1", "garbage");
	assert.deepEqual(readRecent("org-1", userId, store), []);
	writeRecent("org-1", userId, [], store);
	assert.deepEqual(readRecent("org-1", userId, store), []);
	// The cap is applied on read as well, so old oversized payloads shrink.
	store.setItem(
		"search:recent:user-1:org-1",
		JSON.stringify(
			Array.from({ length: RECENT_LIMIT + 5 }, (_, index) => ({
				kind: "issue",
				projectId: `project-${index}`,
				issueNumber: index + 1,
				title: `Issue ${index}`,
				visitedAt: index + 1,
			})),
		),
	);
	assert.equal(readRecent("org-1", userId, store).length, RECENT_LIMIT);
});

test("recent history is isolated per user and skipped without a session", () => {
	const store = memoryStore();
	const input = {
		kind: "issue" as const,
		projectId: "project-1",
		issueNumber: 1,
		identifier: "WEB-1",
		title: "One",
	};
	assert.equal(
		recentStorageKey("org-1", "user-a"),
		"search:recent:user-a:org-1",
	);

	recordRecent("org-1", "user-a", input, store);
	assert.equal(readRecent("org-1", "user-a", store).length, 1);
	assert.deepEqual(readRecent("org-1", "user-b", store), []);
	assert.deepEqual(readRecent("org-1", null, store), []);
	assert.deepEqual(readRecent("org-1", undefined, store), []);
	assert.deepEqual(recordRecent("org-1", null, input, store), []);
	writeRecent("org-1", undefined, [], store);
	// A session-less visit never touches the signed-in history.
	assert.equal(readRecent("org-1", "user-a", store).length, 1);
	// Signing back in with another account still sees an empty history.
	assert.deepEqual(readRecent("org-1", "user-c", store), []);
});

test("selection targets map to the expected routes", () => {
	assert.deepEqual(issueTarget(issueHit()), {
		kind: "issue",
		projectId: "project-1",
		issueNumber: 12,
	});
	assert.deepEqual(commentTarget(commentHit()), {
		kind: "comment",
		projectId: "project-1",
		issueNumber: 12,
		hash: "comment-comment-1",
	});
	assert.deepEqual(projectTarget(projectHit()), {
		kind: "project",
		projectId: "project-1",
	});
	assert.deepEqual(memberTarget("user-1", "project-1"), {
		kind: "member",
		projectId: "project-1",
		assigneeId: "user-1",
	});
	assert.deepEqual(memberTarget("user-1"), {
		kind: "member-no-project",
		memberId: "user-1",
	});
});
