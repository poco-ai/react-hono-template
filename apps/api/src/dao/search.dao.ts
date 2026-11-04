import { type SQL, sql } from "drizzle-orm";
import type { Database } from "../db/types";
import type {
	SearchCommentHitDto,
	SearchIssueHitDto,
	SearchMemberHitDto,
	SearchProjectHitDto,
} from "../dto/search.dto";
import { type SearchTerms, searchExcerpt } from "../lib/search";

/**
 * Cross-entity search reads.
 *
 * Issues and comments use the FTS5 trigram indexes (`issue_search`,
 * `comment_search`); the FTS rows are external content kept in sync by
 * triggers in the `search_fts` migration and the re-runnable
 * `drizzle/fts/search_fts.sql` (re-run it after any migration that rebuilds the
 * `issues`/`comments` tables).
 * Queries join back to the origin tables so organization scoping, soft deletes
 * and project archival always apply — an FTS row for a soft-deleted issue is
 * filtered out here and becomes visible again if the issue is restored. Issues
 * and comments of archived projects are excluded together with the archived
 * projects themselves.
 *
 * Terms shorter than three characters cannot match a trigram index, so they are
 * AND-combined with `instr(lower(col), lower(?)) > 0` on the joined columns
 * (never LIKE: D1 rejects LIKE patterns above 50 bytes, and CJK terms are long).
 * Projects and members do not use FTS at all for the same reason.
 *
 * `instr()` matching is an unindexed scan of the organization's rows: the
 * trigram index only serves terms of three or more characters. The query cap
 * (100 chars, 8 terms) and the per-section limit bound the work, but 1-2
 * character queries are still the most expensive path. The command palette may
 * enforce a minimum of two characters to keep the common case index-backed.
 */

type IssueHitRow = {
	id: string;
	project_id: string;
	project_key: string;
	number: number;
	title: string;
	description: string | null;
	status_id: string;
	status_name: string;
	status_color: string;
	status_category: string;
	priority: number;
	assignee_id: string | null;
	assignee_name: string | null;
	assignee_image: string | null;
	updated_at: number | string;
};

type CommentHitRow = {
	id: string;
	body: string;
	created_at: number | string;
	author_id: string;
	author_name: string;
	author_image: string | null;
	issue_id: string;
	issue_project_id: string;
	issue_number: number;
	issue_title: string;
	project_key: string;
};

type ProjectHitRow = {
	id: string;
	name: string;
	key: string;
	description: string | null;
	color: string | null;
	archived: number | boolean;
	updated_at: number | string;
};

type MemberHitRow = {
	user_id: string;
	name: string;
	image: string | null;
};

const iso = (value: number | string) =>
	new Date(typeof value === "number" ? value : Number(value)).toISOString();

const joinAnd = (conditions: SQL[]) =>
	conditions.length > 0 ? sql`${sql.join(conditions, sql` and `)}` : null;

// --- conditions ------------------------------------------------------------

const issueInstr = (token: string) =>
	sql`(instr(lower(i.title), lower(${token})) > 0 or instr(lower(coalesce(i.description, '')), lower(${token})) > 0)`;

const commentInstr = (token: string) =>
	sql`instr(lower(c.body), lower(${token})) > 0`;

const projectInstr = (token: string) =>
	sql`(instr(lower(p.name), lower(${token})) > 0 or instr(lower(coalesce(p.description, '')), lower(${token})) > 0)`;

const memberInstr = (token: string) =>
	sql`(instr(lower(u.name), lower(${token})) > 0 or instr(lower(u.email), lower(${token})) > 0)`;

// --- projections -----------------------------------------------------------

const ISSUE_PROJECTION = sql`
	i.id as id,
	i.project_id as project_id,
	p.key as project_key,
	i.number as number,
	i.title as title,
	i.description as description,
	i.status_id as status_id,
	s.name as status_name,
	s.color as status_color,
	s.category as status_category,
	i.priority as priority,
	i.assignee_id as assignee_id,
	u.name as assignee_name,
	u.image as assignee_image,
	i.updated_at as updated_at
`;

const ISSUE_JOINS = sql`
	join issues i on i.rowid = issue_search.rowid
	join projects p on p.id = i.project_id
	join issue_statuses s on s.id = i.status_id
	left join user u on u.id = i.assignee_id
`;

const COMMENT_PROJECTION = sql`
	c.id as id,
	c.body as body,
	c.created_at as created_at,
	u.id as author_id,
	u.name as author_name,
	u.image as author_image,
	i.id as issue_id,
	i.project_id as issue_project_id,
	i.number as issue_number,
	i.title as issue_title,
	p.key as project_key
`;

const COMMENT_JOINS = sql`
	join comments c on c.rowid = comment_search.rowid
	join issues i on i.id = c.issue_id
	join projects p on p.id = i.project_id
	join user u on u.id = c.author_id
`;

const toIssueHit = (
	row: IssueHitRow,
	terms: SearchTerms,
): SearchIssueHitDto => ({
	id: row.id,
	projectId: row.project_id,
	projectKey: row.project_key,
	number: row.number,
	identifier: `${row.project_key}-${row.number}`,
	title: row.title,
	descriptionExcerpt: searchExcerpt(row.description, terms),
	statusId: row.status_id,
	statusName: row.status_name,
	statusColor: row.status_color,
	statusCategory: row.status_category,
	priority: row.priority,
	assignee: row.assignee_id
		? {
				id: row.assignee_id,
				name: row.assignee_name ?? "",
				image: row.assignee_image,
			}
		: null,
	updatedAt: iso(row.updated_at),
});

const toCommentHit = (
	row: CommentHitRow,
	terms: SearchTerms,
): SearchCommentHitDto => ({
	id: row.id,
	body: searchExcerpt(row.body, terms) ?? "",
	author: {
		id: row.author_id,
		name: row.author_name,
		image: row.author_image,
	},
	issue: {
		id: row.issue_id,
		projectId: row.issue_project_id,
		projectKey: row.project_key,
		number: row.issue_number,
		identifier: `${row.project_key}-${row.issue_number}`,
		title: row.issue_title,
	},
	createdAt: iso(row.created_at),
});

const toProjectHit = (
	row: ProjectHitRow,
	terms: SearchTerms,
): SearchProjectHitDto => ({
	id: row.id,
	name: row.name,
	key: row.key,
	descriptionExcerpt: searchExcerpt(row.description, terms),
	color: row.color,
	archived: Boolean(row.archived),
	updatedAt: iso(row.updated_at),
});

const toMemberHit = (row: MemberHitRow): SearchMemberHitDto => ({
	id: row.user_id,
	name: row.name,
	image: row.image,
});

export const createSearchDao = (db: Database) => ({
	/** Issues ranked by FTS bm25 when the trigram index applies. */
	searchIssues: async (
		orgId: string,
		terms: SearchTerms,
		limit: number,
	): Promise<SearchIssueHitDto[]> => {
		if (terms.tokens.length === 0) {
			return [];
		}
		const shortFilter = joinAnd(terms.shortTokens.map(issueInstr));
		const rows = terms.ftsQuery
			? await db.all<IssueHitRow>(sql`
					select ${ISSUE_PROJECTION}
					from issue_search
					${ISSUE_JOINS}
					where issue_search match ${terms.ftsQuery}
						and i.org_id = ${orgId}
						and i.deleted_at is null
						and i.archived_at is null
						and p.archived = 0
						${shortFilter ? sql`and ${shortFilter}` : sql``}
					order by bm25(issue_search), i.updated_at desc, i.id
					limit ${limit}
				`)
			: await db.all<IssueHitRow>(sql`
					select ${ISSUE_PROJECTION}
					from issues i
					join projects p on p.id = i.project_id
					join issue_statuses s on s.id = i.status_id
					left join user u on u.id = i.assignee_id
					where i.org_id = ${orgId}
						and i.deleted_at is null
						and i.archived_at is null
						and p.archived = 0
						and ${joinAnd(terms.tokens.map(issueInstr))}
					order by i.updated_at desc, i.id
					limit ${limit}
				`);
		return rows.map((row) => toIssueHit(row, terms));
	},

	/**
	 * Comment hits joined through their issue, so comments of deleted issues or
	 * of another organization never leak even though the FTS index is global.
	 */
	searchComments: async (
		orgId: string,
		terms: SearchTerms,
		limit: number,
	): Promise<SearchCommentHitDto[]> => {
		if (terms.tokens.length === 0) {
			return [];
		}
		const shortFilter = joinAnd(terms.shortTokens.map(commentInstr));
		const rows = terms.ftsQuery
			? await db.all<CommentHitRow>(sql`
					select ${COMMENT_PROJECTION}
					from comment_search
					${COMMENT_JOINS}
					where comment_search match ${terms.ftsQuery}
						and c.org_id = ${orgId}
						and i.org_id = ${orgId}
						and i.deleted_at is null
						and i.archived_at is null
						and p.archived = 0
						${shortFilter ? sql`and ${shortFilter}` : sql``}
					order by bm25(comment_search), c.created_at desc, c.id
					limit ${limit}
				`)
			: await db.all<CommentHitRow>(sql`
					select ${COMMENT_PROJECTION}
					from comments c
					join issues i on i.id = c.issue_id
					join projects p on p.id = i.project_id
					join user u on u.id = c.author_id
					where c.org_id = ${orgId}
						and i.org_id = ${orgId}
						and i.deleted_at is null
						and i.archived_at is null
						and p.archived = 0
						and ${joinAnd(terms.tokens.map(commentInstr))}
					order by c.created_at desc, c.id
					limit ${limit}
				`);
		return rows.map((row) => toCommentHit(row, terms));
	},

	/** Archived projects are excluded from quick search results. */
	searchProjects: async (
		orgId: string,
		terms: SearchTerms,
		limit: number,
	): Promise<SearchProjectHitDto[]> => {
		if (terms.tokens.length === 0) {
			return [];
		}
		const rows = await db.all<ProjectHitRow>(sql`
			select
				p.id as id,
				p.name as name,
				p.key as key,
				p.description as description,
				p.color as color,
				p.archived as archived,
				p.updated_at as updated_at
			from projects p
			where p.org_id = ${orgId}
				and p.archived = 0
				and ${joinAnd(terms.tokens.map(projectInstr))}
			order by p.updated_at desc, p.id
			limit ${limit}
		`);
		return rows.map((row) => toProjectHit(row, terms));
	},

	/**
	 * Members match by name or email but only id/name/image are returned, so
	 * email addresses never leave the server through this endpoint.
	 */
	searchMembers: async (
		orgId: string,
		terms: SearchTerms,
		limit: number,
	): Promise<SearchMemberHitDto[]> => {
		if (terms.tokens.length === 0) {
			return [];
		}
		const rows = await db.all<MemberHitRow>(sql`
			select
				m.user_id as user_id,
				u.name as name,
				u.image as image
			from member m
			join user u on u.id = m.user_id
			where m.organization_id = ${orgId}
				and ${joinAnd(terms.tokens.map(memberInstr))}
			order by u.name, m.user_id
			limit ${limit}
		`);
		return rows.map(toMemberHit);
	},
});

export type SearchDao = ReturnType<typeof createSearchDao>;
