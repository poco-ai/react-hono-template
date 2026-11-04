import {
	ApiError,
	ApiErrorCode,
	addUtcMonths,
	defaultRoadmapWindow,
	ROADMAP_MAX_MONTHS,
	type RoadmapQuery,
	startOfUtcDay,
} from "@workspace/shared";
import { toCycleProgress } from "../dao/cycle.dao";
import type { RoadmapDao } from "../dao/roadmap.dao";
import type { RoadmapDto, RoadmapProjectDto } from "../dto/roadmap.dto";
import { cycleStatus } from "./cycle.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RoadmapWindow = {
	/** Inclusive start of the window. */
	from: Date;
	/** Exclusive end of the window. */
	to: Date;
	truncated: boolean;
};

/**
 * Resolves the query window: calendar days are expanded to UTC day bounds,
 * `to` is exclusive, defaults are one month back through five months ahead,
 * and anything longer than 12 months is clamped (reported via `truncated`).
 */
export const resolveRoadmapWindow = (
	query: RoadmapQuery,
	now: Date = new Date(),
): RoadmapWindow => {
	const defaults = defaultRoadmapWindow(now);
	const from = query.from ? startOfUtcDay(new Date(query.from)) : defaults.from;
	const requestedTo = query.to
		? new Date(startOfUtcDay(new Date(query.to)).getTime() + DAY_MS)
		: defaults.to;
	if (from.getTime() >= requestedTo.getTime()) {
		throw new ApiError(
			ApiErrorCode.VALIDATION,
			"`from` must be on or before `to`",
		);
	}
	const maxEnd = addUtcMonths(from, ROADMAP_MAX_MONTHS);
	const truncated = requestedTo.getTime() > maxEnd.getTime();
	return { from, to: truncated ? maxEnd : requestedTo, truncated };
};

export const createRoadmapService = ({
	roadmapDao,
	now = () => new Date(),
}: {
	roadmapDao: RoadmapDao;
	/** Injectable clock for deterministic window/default tests. */
	now?: () => Date;
}) => ({
	getRoadmap: async (
		orgId: string,
		query: RoadmapQuery,
	): Promise<RoadmapDto> => {
		const current = now();
		const window = resolveRoadmapWindow(query, current);
		const aggregate = await roadmapDao.list(orgId, window.from, window.to);

		const stats = new Map(aggregate.stats.map((row) => [row.projectId, row]));
		const cyclesByProject = new Map<string, RoadmapProjectDto["cycles"]>();
		for (const cycle of aggregate.cycles) {
			const list = cyclesByProject.get(cycle.projectId) ?? [];
			list.push({
				id: cycle.id,
				projectId: cycle.projectId,
				name: cycle.name,
				startsAt: cycle.startsAt.toISOString(),
				endsAt: cycle.endsAt.toISOString(),
				status: cycleStatus(cycle.startsAt, cycle.endsAt, current),
				progress: toCycleProgress(cycle.total, cycle.terminal),
			});
			cyclesByProject.set(cycle.projectId, list);
		}

		return {
			from: window.from.toISOString(),
			to: window.to.toISOString(),
			truncated: window.truncated,
			projects: aggregate.projects.map((project) => ({
				id: project.id,
				key: project.key,
				name: project.name,
				color: project.color,
				health: project.health,
				targetDate: project.targetDate
					? project.targetDate.toISOString()
					: null,
				issueCount: {
					total: stats.get(project.id)?.total ?? 0,
					open: stats.get(project.id)?.open ?? 0,
				},
				cycles: cyclesByProject.get(project.id) ?? [],
			})),
		};
	},
});

export type RoadmapService = ReturnType<typeof createRoadmapService>;
