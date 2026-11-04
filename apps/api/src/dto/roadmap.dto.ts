import type { CycleStatus } from "@workspace/shared";
import type { CycleProgressDto } from "./cycle.dto";

/** A cycle placed on the roadmap timeline, with derived progress/status. */
export type RoadmapCycleDto = {
	id: string;
	projectId: string;
	name: string;
	startsAt: string;
	endsAt: string;
	status: CycleStatus;
	progress: CycleProgressDto;
};

export type RoadmapProjectIssueCountDto = {
	/** Non-deleted, non-archived issues in the project. */
	total: number;
	/** Issues outside terminal status categories. */
	open: number;
};

export type RoadmapProjectDto = {
	id: string;
	key: string;
	name: string;
	color: string | null;
	health: string | null;
	targetDate: string | null;
	issueCount: RoadmapProjectIssueCountDto;
	/** Cycles overlapping the window, ascending by start date. */
	cycles: RoadmapCycleDto[];
};

/**
 * Aggregated roadmap payload. `from` is inclusive and `to` exclusive, both
 * ISO timestamps; `truncated` reports that the requested end was clamped to
 * the 12-month maximum.
 */
export type RoadmapDto = {
	from: string;
	to: string;
	truncated: boolean;
	projects: RoadmapProjectDto[];
};
