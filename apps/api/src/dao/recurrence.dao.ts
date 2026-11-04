import { and, asc, eq, lte, type SQL } from "drizzle-orm";
import { issueRecurrences } from "../db/schema";
import type { Database } from "../db/types";
import type { RecurrenceDto } from "../dto/recurrence.dto";

type RecurrenceRow = typeof issueRecurrences.$inferSelect;

/** Scheduled runs processed per cron tick. */
export const RECURRENCE_DUE_LIMIT = 50;

const toRecurrenceDto = (row: RecurrenceRow): RecurrenceDto => ({
	...row,
	cadence: row.cadence as RecurrenceDto["cadence"],
	labelIds: row.labelIds ?? [],
	nextRunAt: row.nextRunAt.toISOString(),
	lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const createRecurrenceDao = (db: Database) => {
	const scope = (orgId: string, projectId: string, id: string): SQL =>
		and(
			eq(issueRecurrences.orgId, orgId),
			eq(issueRecurrences.projectId, projectId),
			eq(issueRecurrences.id, id),
		) as SQL;

	return {
		listByProject: async (
			orgId: string,
			projectId: string,
		): Promise<RecurrenceDto[]> => {
			const rows = await db
				.select()
				.from(issueRecurrences)
				.where(
					and(
						eq(issueRecurrences.orgId, orgId),
						eq(issueRecurrences.projectId, projectId),
					),
				)
				.orderBy(asc(issueRecurrences.nextRunAt), asc(issueRecurrences.id));
			return rows.map(toRecurrenceDto);
		},

		findById: async (
			orgId: string,
			projectId: string,
			id: string,
		): Promise<RecurrenceDto | null> => {
			const row = await db
				.select()
				.from(issueRecurrences)
				.where(scope(orgId, projectId, id))
				.get();
			return row ? toRecurrenceDto(row) : null;
		},

		create: async (data: {
			id: string;
			orgId: string;
			projectId: string;
			title: string;
			description: string | null;
			statusId: string | null;
			priority: number;
			assigneeId: string | null;
			labelIds: string[];
			estimate: number | null;
			cadence: string;
			nextRunAt: Date;
			anchorDay: number;
			createdById: string | null;
		}): Promise<RecurrenceDto> => {
			const [row] = await db.insert(issueRecurrences).values(data).returning();
			return toRecurrenceDto(row);
		},

		update: async (
			orgId: string,
			projectId: string,
			id: string,
			patch: {
				cadence?: string;
				active?: boolean;
				nextRunAt?: Date;
				anchorDay?: number;
			},
		): Promise<RecurrenceDto | null> => {
			const entries = Object.fromEntries(
				Object.entries(patch).filter(([, value]) => value !== undefined),
			);
			if (Object.keys(entries).length === 0) {
				return null;
			}
			const row = await db
				.update(issueRecurrences)
				.set(entries)
				.where(scope(orgId, projectId, id))
				.returning()
				.get();
			return row ? toRecurrenceDto(row) : null;
		},

		remove: async (
			orgId: string,
			projectId: string,
			id: string,
		): Promise<boolean> => {
			const rows = await db
				.delete(issueRecurrences)
				.where(scope(orgId, projectId, id))
				.returning({ id: issueRecurrences.id });
			return rows.length > 0;
		},

		/** Active recurrences whose scheduled run is due, oldest first. */
		listDue: async (
			now: Date,
			limit: number = RECURRENCE_DUE_LIMIT,
		): Promise<RecurrenceDto[]> => {
			const rows = await db
				.select()
				.from(issueRecurrences)
				.where(
					and(
						eq(issueRecurrences.active, true),
						lte(issueRecurrences.nextRunAt, now),
					),
				)
				.orderBy(asc(issueRecurrences.nextRunAt), asc(issueRecurrences.id))
				.limit(limit);
			return rows.map(toRecurrenceDto);
		},

		/**
		 * Compare-and-set claim used to deduplicate concurrent cron instances:
		 * the run is only claimed when `nextRunAt` still equals the observed
		 * value, so exactly one worker wins and advances the schedule.
		 */
		claim: async (
			id: string,
			observedNextRunAt: Date,
			nextRunAt: Date,
			lastRunAt: Date,
		): Promise<boolean> => {
			const rows = await db
				.update(issueRecurrences)
				.set({ nextRunAt, lastRunAt })
				.where(
					and(
						eq(issueRecurrences.id, id),
						eq(issueRecurrences.active, true),
						eq(issueRecurrences.nextRunAt, observedNextRunAt),
					),
				)
				.returning({ id: issueRecurrences.id });
			return rows.length > 0;
		},

		/**
		 * Rolls a claimed run back when issue creation failed, so the next cron
		 * tick retries it. Compare-and-set on the advanced `nextRunAt`: if an
		 * operator already edited the schedule, their value wins.
		 */
		rollbackClaim: async (
			id: string,
			advancedNextRunAt: Date,
			observedNextRunAt: Date,
			previousLastRunAt: Date | null,
		): Promise<boolean> => {
			const rows = await db
				.update(issueRecurrences)
				.set({ nextRunAt: observedNextRunAt, lastRunAt: previousLastRunAt })
				.where(
					and(
						eq(issueRecurrences.id, id),
						eq(issueRecurrences.nextRunAt, advancedNextRunAt),
					),
				)
				.returning({ id: issueRecurrences.id });
			return rows.length > 0;
		},
	};
};

export type RecurrenceDao = ReturnType<typeof createRecurrenceDao>;
