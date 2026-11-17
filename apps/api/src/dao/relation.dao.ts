import type { IssueRelationType } from "@workspace/shared";
import { and, asc, eq, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { runBatch } from "../db/run-batch";
import { issueRelations } from "../db/schema";
import type { Database } from "../db/types";
import type { IssueRelationDto } from "../dto/relation.dto";
import { queryRows } from "../lib/sql-dialect";
import {
	type ActivityInsert,
	activityInsertStatement,
	activityInsertWhenStatement,
} from "./activity.dao";

type RelationRow = typeof issueRelations.$inferSelect;

const toRelationDto = (row: RelationRow): IssueRelationDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
});

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
		const [rows] = await runBatch(db, (tx) => {
			const statements = [
				tx.insert(issueRelations).values(data).returning(),
				...(activity ? [activityInsertStatement(tx, [activity])] : []),
			] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
			// A unique-index violation here (a concurrent create won the pre-check
			// race) propagates raw; the service maps it to the 409.
			return statements;
		});
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
		const rows = await queryRows<{ found: number }>(
			db,
			sql`
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
		`,
		);
		return rows.length > 0;
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
	 * Deletes the row and writes the activity entry only when a row was
	 * actually removed: the conditional INSERT runs before the DELETE in the
	 * same batch (one transaction), so a repeated or concurrent delete leaves
	 * no orphan activity row.
	 */
	delete: async (
		orgId: string,
		id: string,
		activity?: ActivityInsert,
	): Promise<IssueRelationDto | null> => {
		const results = await runBatch(db, (tx) => {
			const deleteStatement = tx
				.delete(issueRelations)
				.where(and(eq(issueRelations.orgId, orgId), eq(issueRelations.id, id)))
				.returning();
			const statements = (
				activity
					? [
							activityInsertWhenStatement(
								tx,
								activity,
								sql`EXISTS (SELECT 1 FROM ${issueRelations}
								WHERE ${issueRelations.orgId} = ${orgId}
									AND ${issueRelations.id} = ${id})`,
							),
							deleteStatement,
						]
					: [deleteStatement]
			) as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
			return statements;
		});
		const rows = results[results.length - 1] as RelationRow[];
		return rows.length > 0 ? toRelationDto(rows[0]) : null;
	},
});

export type RelationDao = ReturnType<typeof createRelationDao>;
