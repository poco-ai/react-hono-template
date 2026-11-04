import {
	type CycleStatusFilter,
	TERMINAL_STATUS_CATEGORIES,
} from "@workspace/shared";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	notInArray,
	type SQL,
	sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { cycles, issueStatuses, issues } from "../db/schema";
import type { Database } from "../db/types";
import type { CycleDto, CycleProgressDto } from "../dto/cycle.dto";
import {
	cycleDetachActivityStatement,
	cycleRolloverActivityStatement,
} from "./activity.dao";
import { isUniqueConstraintViolation } from "./relation.dao";

type CycleRow = typeof cycles.$inferSelect;

export const toCycleDto = (row: CycleRow): CycleDto => ({
	...row,
	startsAt: row.startsAt.toISOString(),
	endsAt: row.endsAt.toISOString(),
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

/** Whole-percent progress (0-100); 0 for empty cycles. */
export const toCycleProgress = (
	total: number,
	terminal: number,
): CycleProgressDto => ({
	total,
	terminal,
	percent: total > 0 ? Math.round((terminal / total) * 100) : 0,
});

export const createCycleDao = (db: Database) => {
	const projectScope = (orgId: string, projectId: string) =>
		and(eq(cycles.orgId, orgId), eq(cycles.projectId, projectId));

	const maxNumber = async (orgId: string, projectId: string) => {
		const row = await db
			.select({ number: cycles.number })
			.from(cycles)
			.where(projectScope(orgId, projectId))
			.orderBy(desc(cycles.number))
			.limit(1)
			.get();
		return row?.number ?? 0;
	};

	/** Mirrors issue.dao: retry on the (projectId, number) unique index. */
	const MAX_INSERT_ATTEMPTS = 3;

	const statusCondition = (
		status: CycleStatusFilter,
		now: number,
	): SQL | undefined => {
		switch (status) {
			case "current":
				return sql`${cycles.startsAt} <= ${now} and ${cycles.endsAt} >= ${now}`;
			case "upcoming":
				return sql`${cycles.startsAt} > ${now}`;
			case "past":
				return sql`${cycles.endsAt} < ${now}`;
			default:
				return undefined;
		}
	};

	return {
		listByProject: async (
			orgId: string,
			projectId: string,
			options: {
				status: CycleStatusFilter;
				/** Millisecond timestamp used for the derived status filter. */
				now: number;
				page: number;
				pageSize: number;
			},
		): Promise<{ items: CycleDto[]; total: number }> => {
			const status = statusCondition(options.status, options.now);
			const where = status
				? and(projectScope(orgId, projectId), status)
				: projectScope(orgId, projectId);
			const [rows, totals] = await db.batch([
				db
					.select()
					.from(cycles)
					.where(where)
					.orderBy(asc(cycles.startsAt), asc(cycles.number), asc(cycles.id))
					.limit(options.pageSize)
					.offset((options.page - 1) * options.pageSize),
				db.select({ value: count() }).from(cycles).where(where),
			]);
			return {
				items: rows.map(toCycleDto),
				total: totals[0]?.value ?? 0,
			};
		},

		listAllByProject: async (
			orgId: string,
			projectId: string,
		): Promise<CycleDto[]> => {
			const rows = await db
				.select()
				.from(cycles)
				.where(projectScope(orgId, projectId))
				.orderBy(asc(cycles.startsAt), asc(cycles.number))
				.all();
			return rows.map(toCycleDto);
		},

		findById: async (orgId: string, id: string): Promise<CycleDto | null> => {
			const row = await db
				.select()
				.from(cycles)
				.where(and(eq(cycles.orgId, orgId), eq(cycles.id, id)))
				.get();
			return row ? toCycleDto(row) : null;
		},

		findForProject: async (
			orgId: string,
			projectId: string,
			id: string,
		): Promise<CycleDto | null> => {
			const row = await db
				.select()
				.from(cycles)
				.where(and(projectScope(orgId, projectId), eq(cycles.id, id)))
				.get();
			return row ? toCycleDto(row) : null;
		},

		/**
		 * Any cycle whose closed [startsAt, endsAt] range overlaps the given
		 * range. End dates are inclusive (a cycle covers its UTC end day), so
		 * ranges that merely touch at exactly the same millisecond overlap;
		 * adjacent days (23:59:59.999 vs 00:00 tomorrow) do not.
		 */
		findOverlap: async (
			orgId: string,
			projectId: string,
			startsAt: Date,
			endsAt: Date,
			excludeId?: string,
		): Promise<CycleDto | null> => {
			const conditions: SQL[] = [
				eq(cycles.orgId, orgId),
				eq(cycles.projectId, projectId),
				lte(cycles.startsAt, endsAt),
				gte(cycles.endsAt, startsAt),
			];
			if (excludeId) {
				conditions.push(sql`${cycles.id} <> ${excludeId}`);
			}
			const row = await db
				.select()
				.from(cycles)
				.where(and(...conditions))
				.get();
			return row ? toCycleDto(row) : null;
		},

		maxNumber,

		/** Issue totals/terminal counts for the given cycles (single query). */
		progressByCycle: async (
			orgId: string,
			cycleIds: string[],
		): Promise<Map<string, { total: number; terminal: number }>> => {
			const progress = new Map<string, { total: number; terminal: number }>();
			if (cycleIds.length === 0) {
				return progress;
			}
			const rows = await db
				.select({
					cycleId: issues.cycleId,
					total: count(),
					terminal:
						sql<number>`sum(case when ${inArray(issueStatuses.category, [...TERMINAL_STATUS_CATEGORIES])} then 1 else 0 end)`.as(
							"terminal_count",
						),
				})
				.from(issues)
				.innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
				.where(
					and(
						eq(issues.orgId, orgId),
						inArray(issues.cycleId, cycleIds),
						isNull(issues.deletedAt),
						// Archived issues do not count toward cycle progress.
						isNull(issues.archivedAt),
					),
				)
				.groupBy(issues.cycleId)
				.all();
			for (const row of rows) {
				if (!row.cycleId) {
					continue;
				}
				progress.set(row.cycleId, {
					total: row.total,
					terminal: Number(row.terminal ?? 0),
				});
			}
			return progress;
		},

		/**
		 * Inserts a cycle with the next per-project number. Two concurrent
		 * creates can read the same max number; the loser hits the unique
		 * (projectId, number) index and retries with the following number.
		 */
		createWithNumber: async (data: {
			id: string;
			orgId: string;
			projectId: string;
			name: string;
			startsAt: Date;
			endsAt: Date;
			createdById: string | null;
		}): Promise<CycleDto> => {
			let lastError: unknown;
			for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
				const number = (await maxNumber(data.orgId, data.projectId)) + 1;
				try {
					const row = await db
						.insert(cycles)
						.values({ ...data, number })
						.returning()
						.get();
					return toCycleDto(row);
				} catch (err) {
					lastError = err;
					if (!isUniqueConstraintViolation(err)) {
						throw err;
					}
				}
			}
			throw lastError;
		},

		update: async (
			orgId: string,
			id: string,
			patch: Partial<{
				name: string;
				startsAt: Date;
				endsAt: Date;
			}>,
		): Promise<CycleDto | null> => {
			const patchEntries = Object.fromEntries(
				Object.entries(patch).filter(([, value]) => value !== undefined),
			);
			if (Object.keys(patchEntries).length === 0) {
				return db
					.select()
					.from(cycles)
					.where(and(eq(cycles.orgId, orgId), eq(cycles.id, id)))
					.get()
					.then((row) => (row ? toCycleDto(row) : null));
			}
			const row = await db
				.update(cycles)
				.set(patchEntries)
				.where(and(eq(cycles.orgId, orgId), eq(cycles.id, id)))
				.returning()
				.get();
			return row ? toCycleDto(row) : null;
		},

		/**
		 * Deletes the cycle and detaches its issues in the same batch. The FK is
		 * `on delete set null`, but D1 does not always enforce foreign keys, so
		 * the detach is explicit: issues survive cycle deletion without a cycle.
		 * One `field = "cycle"` activity row is written per affected issue before
		 * the detach (mirroring rollover), so the history keeps the cycle name.
		 */
		delete: async (
			orgId: string,
			id: string,
			params: { actorId: string; sourceName: string },
		): Promise<boolean> => {
			const [, , deleted] = await db.batch([
				cycleDetachActivityStatement(db, {
					orgId,
					sourceCycleId: id,
					actorId: params.actorId,
					sourceName: params.sourceName,
				}),
				db
					.update(issues)
					.set({ cycleId: null })
					.where(and(eq(issues.orgId, orgId), eq(issues.cycleId, id))),
				db
					.delete(cycles)
					.where(and(eq(cycles.orgId, orgId), eq(cycles.id, id)))
					.returning({ id: cycles.id }),
			]);
			return deleted.length > 0;
		},

		/**
		 * Moves every non-terminal, non-deleted issue from one cycle to another
		 * and records one `field = "cycle"` activity row per moved issue — all in
		 * a single D1 batch (transaction). The activity INSERT ... SELECT runs
		 * first so it still sees the source cycle assignment.
		 */
		rollover: async (params: {
			orgId: string;
			projectId: string;
			sourceCycleId: string;
			targetCycleId: string;
			actorId: string;
			sourceName: string;
			targetName: string;
		}): Promise<number> => {
			const statements = [
				cycleRolloverActivityStatement(db, params),
				db
					.update(issues)
					.set({ cycleId: params.targetCycleId })
					.where(
						and(
							eq(issues.orgId, params.orgId),
							eq(issues.projectId, params.projectId),
							eq(issues.cycleId, params.sourceCycleId),
							isNull(issues.deletedAt),
							// Archived issues stay parked in their cycle.
							isNull(issues.archivedAt),
							notInArray(
								issues.statusId,
								db
									.select({ id: issueStatuses.id })
									.from(issueStatuses)
									.where(
										inArray(issueStatuses.category, [
											...TERMINAL_STATUS_CATEGORIES,
										]),
									),
							),
						),
					)
					.returning({ id: issues.id }),
			] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
			const [, updated] = await db.batch(statements);
			return updated.length;
		},
	};
};

export type CycleDao = ReturnType<typeof createCycleDao>;
