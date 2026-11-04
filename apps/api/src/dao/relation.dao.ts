import {
	ApiError,
	ApiErrorCode,
	type IssueRelationType,
} from "@workspace/shared";
import { and, asc, eq, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { issueRelations } from "../db/schema";
import type { Database } from "../db/types";
import type { IssueRelationDto } from "../dto/relation.dto";
import { type ActivityInsert, activityInsertStatement } from "./activity.dao";

type RelationRow = typeof issueRelations.$inferSelect;

const toRelationDto = (row: RelationRow): IssueRelationDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
});

/**
 * SQLite reports unique-index clashes as a "UNIQUE constraint failed" error.
 * Drivers wrap it (drizzle-orm wraps the SQLiteError in a DrizzleQueryError),
 * so the cause chain is inspected too.
 */
export const isUniqueConstraintViolation = (err: unknown): boolean => {
	if (!(err instanceof Error)) {
		return false;
	}
	if (/unique constraint failed/i.test(err.message)) {
		return true;
	}
	const cause = (err as { cause?: unknown }).cause;
	return (
		cause !== undefined && cause !== err && isUniqueConstraintViolation(cause)
	);
};

export const relationExistsError = () =>
	new ApiError(
		409,
		ApiErrorCode.ISSUE_RELATION_EXISTS,
		"These issues are already linked with this relation type",
	);

/** Batch statement used when an issue is soft-deleted (either side). */
export const deleteRelationsForIssueStatement = (
	db: Database,
	orgId: string,
	issueId: string,
): BatchItem<"sqlite"> =>
	db
		.delete(issueRelations)
		.where(
			and(
				eq(issueRelations.orgId, orgId),
				or(
					eq(issueRelations.issueId, issueId),
					eq(issueRelations.relatedIssueId, issueId),
				),
			),
		);

export const createRelationDao = (db: Database) => ({
	create: async (
		data: {
			id: string;
			orgId: string;
			issueId: string;
			relatedIssueId: string;
			type: IssueRelationType;
			createdById: string | null;
		},
		activity?: ActivityInsert,
	): Promise<IssueRelationDto> => {
		const statements = [
			db.insert(issueRelations).values(data).returning(),
			...(activity ? [activityInsertStatement(db, [activity])] : []),
		] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
		let rows: unknown[];
		try {
			[rows] = await db.batch(statements);
		} catch (err) {
			// Concurrent writes can pass the service's pre-check; the unique index
			// is the source of truth and maps to the same 409 the check throws.
			if (isUniqueConstraintViolation(err)) {
				throw relationExistsError();
			}
			throw err;
		}
		const row = (rows as RelationRow[])[0];
		if (!row) {
			throw new Error("Failed to insert issue relation");
		}
		return toRelationDto(row);
	},

	findById: async (
		orgId: string,
		id: string,
	): Promise<IssueRelationDto | null> => {
		const row = await db
			.select()
			.from(issueRelations)
			.where(and(eq(issueRelations.orgId, orgId), eq(issueRelations.id, id)))
			.get();
		return row ? toRelationDto(row) : null;
	},

	/** Exact directed pair lookup (both ids are in storage order). */
	findByPair: async (
		orgId: string,
		issueId: string,
		relatedIssueId: string,
		type: IssueRelationType,
	): Promise<IssueRelationDto | null> => {
		const row = await db
			.select()
			.from(issueRelations)
			.where(
				and(
					eq(issueRelations.orgId, orgId),
					eq(issueRelations.issueId, issueId),
					eq(issueRelations.relatedIssueId, relatedIssueId),
					eq(issueRelations.type, type),
				),
			)
			.get();
		return row ? toRelationDto(row) : null;
	},

	/**
	 * Whether `toIssueId` is reachable from `fromIssueId` by following blocks
	 * edges (A blocks B is stored as issue_id = A, related_issue_id = B).
	 *
	 * One recursive CTE in the organization; `UNION` (not `UNION ALL`) dedupes
	 * visited issues so cycles already in the data cannot loop forever. Adds
	 * no per-hop round trips.
	 */
	hasBlocksPath: async (
		orgId: string,
		fromIssueId: string,
		toIssueId: string,
	): Promise<boolean> => {
		if (fromIssueId === toIssueId) {
			return true;
		}
		const row = await db.get<{ found: number }>(sql`
			WITH RECURSIVE reachable(issue_id) AS (
				SELECT issue_relations.related_issue_id
				FROM issue_relations
				WHERE issue_relations.org_id = ${orgId}
					AND issue_relations.issue_id = ${fromIssueId}
					AND issue_relations.type = 'blocks'
				UNION
				SELECT issue_relations.related_issue_id
				FROM issue_relations
				JOIN reachable ON issue_relations.issue_id = reachable.issue_id
				WHERE issue_relations.org_id = ${orgId}
					AND issue_relations.type = 'blocks'
			)
			SELECT 1 AS found FROM reachable WHERE issue_id = ${toIssueId} LIMIT 1
		`);
		return row != null;
	},

	/**
	 * Relations where the issue is on either side. Ordered by creation time
	 * (then id) so grouped views do not reorder between renders.
	 */
	listByIssue: async (
		orgId: string,
		issueId: string,
	): Promise<IssueRelationDto[]> => {
		const rows = await db
			.select()
			.from(issueRelations)
			.where(
				and(
					eq(issueRelations.orgId, orgId),
					or(
						eq(issueRelations.issueId, issueId),
						eq(issueRelations.relatedIssueId, issueId),
					),
				),
			)
			.orderBy(asc(issueRelations.createdAt), asc(issueRelations.id));
		return rows.map(toRelationDto);
	},

	/**
	 * Deletes the row and, only when a row was actually removed, writes the
	 * activity entry (a repeated/concurrent delete leaves no orphan activity).
	 */
	delete: async (
		orgId: string,
		id: string,
		activity?: ActivityInsert,
	): Promise<IssueRelationDto | null> => {
		const row = await db
			.delete(issueRelations)
			.where(and(eq(issueRelations.orgId, orgId), eq(issueRelations.id, id)))
			.returning()
			.get();
		if (!row) {
			return null;
		}
		if (activity) {
			await activityInsertStatement(db, [activity]);
		}
		return toRelationDto(row);
	},
});

export type RelationDao = ReturnType<typeof createRelationDao>;
