import type {
	SearchCommentHitDto,
	SearchIssueHitDto,
	SearchMemberHitDto,
	SearchProjectHitDto,
	SearchResultsDto,
} from "@api/dto/search.dto";
import { queryOptions } from "@tanstack/react-query";
import {
	SEARCH_DEFAULT_LIMIT,
	SEARCH_MAX_LIMIT,
	SEARCH_MAX_QUERY_LENGTH,
	STATUS_CATEGORIES,
	type StatusCategory,
} from "@workspace/shared";
import { useEffect } from "react";
import { client, unwrap } from "@/lib/api";

/**
 * Command-palette quick search (`GET /api/orgs/:orgId/search`). The API caps
 * each section independently and returns empty sections for an empty query;
 * this module normalizes the payload defensively, owns the query keys and the
 * per-organization recent-history helpers.
 */

export const SEARCH_DEBOUNCE_MS = 250;
/** The API accepts single-character terms (it falls back to `instr()`). */
export const SEARCH_MIN_LENGTH = 1;
/** Recent entries shown in the palette's empty state. */
export const RECENT_LIMIT = 10;

export type SearchResults = SearchResultsDto;

export type {
	SearchCommentHitDto,
	SearchIssueHitDto,
	SearchMemberHitDto,
	SearchProjectHitDto,
} from "@api/dto/search.dto";

export const emptySearchResults = (): SearchResults => ({
	issues: [],
	comments: [],
	projects: [],
	members: [],
});

export const normalizeSearchTerm = (term: string) =>
	term.trim().slice(0, SEARCH_MAX_QUERY_LENGTH);

export const clampSearchLimit = (limit: number) => {
	const value = Number.isFinite(limit)
		? Math.trunc(limit)
		: SEARCH_DEFAULT_LIMIT;
	return Math.min(Math.max(value, 1), SEARCH_MAX_LIMIT);
};

export interface SearchRequest {
	q: string;
	limit: number;
}

/**
 * Builds the request parameters from a raw input term. Returns `null` for an
 * empty term so the query stays disabled and no request is sent.
 */
export function buildSearchRequest(
	term: string,
	limit: number = SEARCH_DEFAULT_LIMIT,
): SearchRequest | null {
	const q = normalizeSearchTerm(term);
	if (q.length < SEARCH_MIN_LENGTH) {
		return null;
	}
	return { q, limit: clampSearchLimit(limit) };
}

export const searchKey = (orgId: string, request: SearchRequest | null) =>
	[
		"orgs",
		orgId,
		"search",
		request?.q ?? "",
		request?.limit ?? SEARCH_DEFAULT_LIMIT,
	] as const;

export const fetchSearch = (orgId: string, request: SearchRequest) =>
	unwrap(
		client.api.orgs[":orgId"].search.$get({
			param: { orgId },
			query: { q: request.q, limit: String(request.limit) },
		}),
	);

export function searchQuery(
	orgId: string,
	term: string,
	{ limit = SEARCH_DEFAULT_LIMIT }: { limit?: number } = {},
) {
	const request = buildSearchRequest(term, limit);
	// The query is only enabled for a non-empty term, so the fetch always runs
	// with the same `q` that built the key; the params below never leak an
	// empty-query request.
	const params: SearchRequest = {
		q: normalizeSearchTerm(term),
		limit: clampSearchLimit(limit),
	};
	return queryOptions({
		queryKey: searchKey(orgId, request),
		queryFn: async () =>
			normalizeSearchResults(await fetchSearch(orgId, params)),
		enabled: request !== null,
	});
}

// --- response normalization ------------------------------------------------

const record = (value: unknown): Record<string, unknown> | null =>
	typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

const numberOf = (value: unknown, fallback = 0) =>
	typeof value === "number" && Number.isFinite(value)
		? value
		: Number.isFinite(Number(value))
			? Number(value)
			: fallback;

const arrayOf = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

const userOf = (value: unknown) => {
	const entry = record(value);
	if (!entry) return null;
	const id = textOf(entry.id);
	const name = textOf(entry.name);
	if (!id || !name) return null;
	return { id, name, image: textOf(entry.image) || null };
};

const statusCategoryOf = (value: unknown): StatusCategory => {
	const category = textOf(value);
	return (STATUS_CATEGORIES as readonly string[]).includes(category)
		? (category as StatusCategory)
		: "unstarted";
};

function issueOf(value: unknown): SearchIssueHitDto | null {
	const entry = record(value);
	if (!entry) return null;
	const id = textOf(entry.id);
	const projectId = textOf(entry.projectId);
	const projectKey = textOf(entry.projectKey);
	const title = textOf(entry.title);
	const number = numberOf(entry.number);
	if (!id || !projectId || !title || number <= 0) return null;
	return {
		id,
		projectId,
		projectKey,
		number,
		identifier: textOf(entry.identifier) || `${projectKey}-${number}`,
		title,
		descriptionExcerpt: textOf(entry.descriptionExcerpt) || null,
		statusId: textOf(entry.statusId),
		statusName: textOf(entry.statusName),
		statusColor: textOf(entry.statusColor),
		statusCategory: textOf(entry.statusCategory)
			? statusCategoryOf(entry.statusCategory)
			: "unstarted",
		priority: numberOf(entry.priority),
		assignee: userOf(entry.assignee),
		updatedAt: textOf(entry.updatedAt),
	};
}

function commentOf(value: unknown): SearchCommentHitDto | null {
	const entry = record(value);
	const issue = record(entry?.issue);
	if (!entry || !issue) return null;
	const id = textOf(entry.id);
	const body = textOf(entry.body);
	const projectId = textOf(issue.projectId);
	const issueNumber = numberOf(issue.number);
	if (!id || !body || !projectId || issueNumber <= 0) return null;
	const projectKey = textOf(issue.projectKey);
	const author = userOf(entry.author) ?? { id: "", name: "", image: null };
	return {
		id,
		body,
		author,
		issue: {
			id: textOf(issue.id),
			projectId,
			projectKey,
			number: issueNumber,
			identifier: textOf(issue.identifier) || `${projectKey}-${issueNumber}`,
			title: textOf(issue.title),
		},
		createdAt: textOf(entry.createdAt),
	};
}

function projectOf(value: unknown): SearchProjectHitDto | null {
	const entry = record(value);
	if (!entry) return null;
	const id = textOf(entry.id);
	const name = textOf(entry.name);
	if (!id || !name) return null;
	return {
		id,
		name,
		key: textOf(entry.key),
		descriptionExcerpt: textOf(entry.descriptionExcerpt) || null,
		color: textOf(entry.color) || null,
		archived: entry.archived === true,
		updatedAt: textOf(entry.updatedAt),
	};
}

function memberOf(value: unknown): SearchMemberHitDto | null {
	const entry = record(value);
	if (!entry) return null;
	const id = textOf(entry.id);
	const name = textOf(entry.name);
	if (!id || !name) return null;
	return { id, name, image: textOf(entry.image) || null };
}

const compact = <T>(
	entries: unknown[],
	convert: (value: unknown) => T | null,
) =>
	entries.flatMap((entry) => {
		const converted = convert(entry);
		return converted ? [converted] : [];
	});

/**
 * Drops malformed or missing sections instead of failing the whole palette.
 * Older/partial payloads keep whatever valid rows they contain.
 */
export function normalizeSearchResults(raw: unknown): SearchResults {
	const payload = record(raw);
	if (!payload) {
		return emptySearchResults();
	}
	return {
		issues: compact(arrayOf(payload.issues), issueOf),
		comments: compact(arrayOf(payload.comments), commentOf),
		projects: compact(arrayOf(payload.projects), projectOf),
		members: compact(arrayOf(payload.members), memberOf),
	};
}

// --- navigation targets ----------------------------------------------------

/**
 * Framework-neutral selection targets. The palette maps these to typed route
 * navigations; tests assert the mapping without a router.
 */
export type SearchTarget =
	| { kind: "issue"; projectId: string; issueNumber: number }
	| {
			kind: "comment";
			projectId: string;
			issueNumber: number;
			hash: string;
	  }
	| { kind: "project"; projectId: string }
	| { kind: "member"; projectId: string; assigneeId: string }
	| { kind: "member-no-project"; memberId: string };

export const issueTarget = (
	hit: Pick<SearchIssueHitDto, "projectId" | "number">,
): SearchTarget => ({
	kind: "issue",
	projectId: hit.projectId,
	issueNumber: hit.number,
});

export const commentTarget = (hit: SearchCommentHitDto): SearchTarget => ({
	kind: "comment",
	projectId: hit.issue.projectId,
	issueNumber: hit.issue.number,
	hash: `comment-${hit.id}`,
});

export const projectTarget = (
	hit: Pick<SearchProjectHitDto, "id">,
): SearchTarget => ({
	kind: "project",
	projectId: hit.id,
});

/** Members filter the current project; without one the palette shows a hint. */
export const memberTarget = (
	memberId: string,
	projectId?: string,
): SearchTarget =>
	projectId
		? { kind: "member", projectId, assigneeId: memberId }
		: { kind: "member-no-project", memberId };

// --- recent history --------------------------------------------------------

export interface RecentIssueInput {
	kind: "issue";
	projectId: string;
	issueNumber: number;
	identifier: string;
	title: string;
}

export interface RecentProjectInput {
	kind: "project";
	projectId: string;
	name: string;
	key: string;
}

export type RecentEntryInput = RecentIssueInput | RecentProjectInput;

export type RecentEntry = RecentEntryInput & { visitedAt: number };

/**
 * Recent history is scoped by organization *and* user so switching accounts on
 * the same browser never exposes another person's palette history. Without a
 * session there is no key and nothing is written.
 */
export const recentStorageKey = (orgId: string, userId: string) =>
	`search:recent:${userId}:${orgId}`;

const recentId = (entry: RecentEntryInput) =>
	entry.kind === "issue"
		? `issue:${entry.projectId}:${entry.issueNumber}`
		: `project:${entry.projectId}`;

/**
 * Puts the newest entry first, de-duplicating by issue reference / project and
 * keeping at most `limit` entries.
 */
export function pushRecent(
	entries: readonly RecentEntry[],
	entry: RecentEntry,
	limit: number = RECENT_LIMIT,
): RecentEntry[] {
	const next = [
		entry,
		...entries.filter((e) => recentId(e) !== recentId(entry)),
	];
	return next
		.sort((a, b) => b.visitedAt - a.visitedAt)
		.slice(0, Math.max(limit, 1));
}

function recentOf(value: unknown): RecentEntry | null {
	const entry = record(value);
	if (!entry) return null;
	const projectId = textOf(entry.projectId);
	const visitedAt = numberOf(entry.visitedAt);
	if (!projectId || visitedAt <= 0) return null;
	if (entry.kind === "project") {
		const name = textOf(entry.name);
		if (!name) return null;
		return {
			kind: "project",
			projectId,
			name,
			key: textOf(entry.key),
			visitedAt,
		};
	}
	if (entry.kind === "issue") {
		const title = textOf(entry.title);
		const issueNumber = numberOf(entry.issueNumber);
		if (!title || issueNumber <= 0) return null;
		return {
			kind: "issue",
			projectId,
			issueNumber,
			identifier: textOf(entry.identifier),
			title,
			visitedAt,
		};
	}
	return null;
}

/** Parses persisted history, dropping invalid or duplicate rows. */
export function parseRecent(
	raw: unknown,
	limit: number = RECENT_LIMIT,
): RecentEntry[] {
	let value = raw;
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(value)) {
		return [];
	}
	const entries: RecentEntry[] = [];
	for (const item of value) {
		const entry = recentOf(item);
		if (entry && !entries.some((e) => recentId(e) === recentId(entry))) {
			entries.push(entry);
		}
	}
	return entries
		.sort((a, b) => b.visitedAt - a.visitedAt)
		.slice(0, Math.max(limit, 1));
}

type RecentStore = Pick<Storage, "getItem" | "setItem">;

const storage = (): RecentStore | null => {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
};

export function readRecent(
	orgId: string,
	userId: string | null | undefined,
	store: RecentStore | null = storage(),
): RecentEntry[] {
	if (!userId) {
		return [];
	}
	try {
		return parseRecent(store?.getItem(recentStorageKey(orgId, userId)));
	} catch {
		return [];
	}
}

export function writeRecent(
	orgId: string,
	userId: string | null | undefined,
	entries: readonly RecentEntry[],
	store: RecentStore | null = storage(),
) {
	if (!userId) {
		return;
	}
	try {
		store?.setItem(recentStorageKey(orgId, userId), JSON.stringify(entries));
	} catch {
		// Storage can be unavailable (private mode); history stays ephemeral.
	}
}

/** Records a palette selection or detail-page visit; returns the new list. */
export function recordRecent(
	orgId: string,
	userId: string | null | undefined,
	input: RecentEntryInput,
	store: RecentStore | null = storage(),
): RecentEntry[] {
	if (!userId) {
		return [];
	}
	const next = pushRecent(readRecent(orgId, userId, store), {
		...input,
		visitedAt: Date.now(),
	});
	writeRecent(orgId, userId, next, store);
	return next;
}

// --- hooks -----------------------------------------------------------------

/** Writes an issue visit to recent history once its detail data is loaded. */
export function useRecordRecentIssue(
	orgId: string,
	userId: string | null | undefined,
	issue: {
		projectId: string;
		issueNumber: number;
		identifier: string;
		title: string;
	} | null,
) {
	const projectId = issue?.projectId;
	const issueNumber = issue?.issueNumber;
	const identifier = issue?.identifier;
	const title = issue?.title;
	useEffect(() => {
		if (!userId || !projectId || !issueNumber || !identifier || !title) {
			return;
		}
		recordRecent(orgId, userId, {
			kind: "issue",
			projectId,
			issueNumber,
			identifier,
			title,
		});
	}, [orgId, userId, projectId, issueNumber, identifier, title]);
}

/** Writes a project visit to recent history once the project is loaded. */
export function useRecordRecentProject(
	orgId: string,
	userId: string | null | undefined,
	project: { projectId: string; name: string; key: string } | null,
) {
	const projectId = project?.projectId;
	const name = project?.name;
	const key = project?.key;
	useEffect(() => {
		if (!userId || !projectId || !name) {
			return;
		}
		recordRecent(orgId, userId, {
			kind: "project",
			projectId,
			name,
			key: key ?? "",
		});
	}, [orgId, userId, projectId, name, key]);
}
