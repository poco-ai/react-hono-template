import { TERMINAL_STATUS_CATEGORIES } from "@workspace/shared";
import {
	and,
	asc,
	count,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	sql,
} from "drizzle-orm";
import { cycles, issueStatuses, issues, projects } from "../db/schema";
import type { Database } from "../db/types";

export type RoadmapCycleRow = {
	id: string;
	projectId: string;
	name: string;
	startsAt: Date;
	endsAt: Date;
	total: number;
	terminal: number;
};

export type RoadmapProjectRow = {
	id: string;
	key: string;
	name: string;
	color: string | null;
	health: string | null;
	targetDate: Date | null;
};

export type RoadmapStatsRow = {
	projectId: string;
	total: number;
	open: number;
};

export type RoadmapAggregate = {
	projects: RoadmapProjectRow[];
	cycles: RoadmapCycleRow[];
	stats: RoadmapStatsRow[];
};

const terminalCount = sql<number>`sum(case when ${inArray(issueStatuses.category, [...TERMINAL_STATUS_CATEGORIES])} then 1 else 0 end)`;

const openCount = sql<number>`sum(case when ${inArray(issueStatuses.category, [
	...TERMINAL_STATUS_CATEGORIES,
])} then 0 else 1 end)`;

/**
 * Roadmap read model: one D1 batch (single roundtrip) with the project list,
 * the window-overlapping cycles (progress aggregated in SQL) and per-project
 * issue statistics. Ordered joined columns are aliased to unique names —
 * D1 batch results map by column name (drizzle-orm#6038).
 */
export const createRoadmapDao = (db: Database) => ({
	list: async (
		orgId: string,
		from: Date,
		to: Date,
	): Promise<RoadmapAggregate> => {
		const activeIssues = and(
			eq(issues.orgId, orgId),
			isNull(issues.deletedAt),
			isNull(issues.archivedAt),
		);
		const [projectRows, cycleRows, statRows] = await db.batch([
			db
				.select({
					id: projects.id,
					key: projects.key,
					name: projects.name,
					color: projects.color,
					health: projects.health,
					targetDate: projects.targetDate,
				})
				.from(projects)
				.where(and(eq(projects.orgId, orgId), eq(projects.archived, false)))
				.orderBy(asc(projects.name), asc(projects.id)),
			db
				.select({
					id: cycles.id,
					projectId: cycles.projectId.as("roadmap_cycle_project_id"),
					name: cycles.name,
					startsAt: cycles.startsAt,
					endsAt: cycles.endsAt,
					total: count(issues.id).as("roadmap_cycle_total"),
					terminal: terminalCount.as("roadmap_cycle_terminal"),
				})
				.from(cycles)
				.innerJoin(projects, eq(projects.id, cycles.projectId))
				.leftJoin(
					issues,
					and(
						eq(issues.cycleId, cycles.id),
						eq(issues.projectId, cycles.projectId),
						isNull(issues.deletedAt),
						isNull(issues.archivedAt),
					),
				)
				.leftJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
				.where(
					and(
						eq(cycles.orgId, orgId),
						eq(projects.archived, false),
						lt(cycles.startsAt, to),
						gte(cycles.endsAt, from),
					),
				)
				.groupBy(cycles.id)
				.orderBy(asc(cycles.startsAt), asc(cycles.id)),
			db
				.select({
					projectId: issues.projectId.as("roadmap_stat_project_id"),
					total: count().as("roadmap_stat_total"),
					open: openCount.as("roadmap_stat_open"),
				})
				.from(issues)
				.innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
				.where(activeIssues)
				.groupBy(issues.projectId),
		]);
		return {
			projects: projectRows,
			cycles: cycleRows.map((row) => ({
				...row,
				total: Number(row.total ?? 0),
				terminal: Number(row.terminal ?? 0),
			})),
			stats: statRows.map((row) => ({
				...row,
				total: Number(row.total ?? 0),
				open: Number(row.open ?? 0),
			})),
		};
	},
});

export type RoadmapDao = ReturnType<typeof createRoadmapDao>;
