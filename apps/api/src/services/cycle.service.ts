import {
	ApiError,
	ApiErrorCode,
	type CreateCycleInput,
	type CycleListQuery,
	type CycleStatus,
	type RolloverCycleInput,
	type UpdateCycleInput,
} from "@workspace/shared";
import { type CycleDao, toCycleProgress } from "../dao/cycle.dao";
import type { ProjectDao } from "../dao/project.dao";
import { isUniqueConstraintViolation } from "../dao/relation.dao";
import type {
	CycleDto,
	CycleRolloverDto,
	CycleWithProgressDto,
	ListCyclesDto,
} from "../dto/cycle.dto";

const cycleNotFound = (id: string) =>
	new ApiError(404, ApiErrorCode.CYCLE_NOT_FOUND, `Cycle ${id} not found`);

const toMs = (value: Date | string | number): number =>
	value instanceof Date
		? value.getTime()
		: typeof value === "number"
			? value
			: Date.parse(value);

/** Derived cycle state from its dates; never stored. */
export const cycleStatus = (
	startsAt: Date | string | number,
	endsAt: Date | string | number,
	now: Date | string | number = new Date(),
): CycleStatus => {
	const start = toMs(startsAt);
	const end = toMs(endsAt);
	const current = toMs(now);
	if (current < start) {
		return "upcoming";
	}
	// End dates are inclusive: the cycle is current through its end day
	// (typically 23:59:59.999Z) and only becomes past after that millisecond.
	return current > end ? "past" : "current";
};

/**
 * Cycle assignment guard shared by issue create/update: the cycle must exist in
 * the organization (org-scoped lookup) and belong to the issue's project.
 */
export const assertCycleAssignable = async (
	cycleDao: Pick<CycleDao, "findById">,
	orgId: string,
	projectId: string,
	cycleId: string,
): Promise<CycleDto> => {
	const cycle = await cycleDao.findById(orgId, cycleId);
	if (!cycle) {
		throw cycleNotFound(cycleId);
	}
	if (cycle.projectId !== projectId) {
		throw new ApiError(
			400,
			ApiErrorCode.VALIDATION,
			"Cycle must belong to the same project as the issue",
		);
	}
	return cycle;
};

const assertRange = (startsAt: Date, endsAt: Date) => {
	if (endsAt.getTime() <= startsAt.getTime()) {
		throw new ApiError(
			400,
			ApiErrorCode.CYCLE_RANGE_INVALID,
			"endsAt must be after startsAt",
		);
	}
};

export const createCycleService = ({
	cycleDao,
	projectDao,
	now = () => new Date(),
}: {
	cycleDao: CycleDao;
	projectDao: Pick<ProjectDao, "findById">;
	/** Injectable clock for deterministic status/progress tests. */
	now?: () => Date;
}) => {
	const requireProject = async (orgId: string, projectId: string) => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		return project;
	};

	const toCycleWithProgress = (
		cycle: CycleDto,
		progress?: { total: number; terminal: number },
		nowDate: Date = now(),
	): CycleWithProgressDto => ({
		...cycle,
		status: cycleStatus(cycle.startsAt, cycle.endsAt, nowDate),
		progress: toCycleProgress(progress?.total ?? 0, progress?.terminal ?? 0),
	});

	const assertNoOverlap = async (
		orgId: string,
		projectId: string,
		startsAt: Date,
		endsAt: Date,
		excludeId?: string,
	) => {
		const overlap = await cycleDao.findOverlap(
			orgId,
			projectId,
			startsAt,
			endsAt,
			excludeId,
		);
		if (overlap) {
			throw new ApiError(
				409,
				ApiErrorCode.CYCLE_OVERLAP,
				`Cycle dates overlap with "${overlap.name}"`,
			);
		}
	};

	return {
		cycleStatus,

		listCycles: async (
			orgId: string,
			projectId: string,
			query: CycleListQuery,
		): Promise<ListCyclesDto> => {
			await requireProject(orgId, projectId);
			const nowDate = now();
			const { items, total } = await cycleDao.listByProject(orgId, projectId, {
				status: query.status,
				now: nowDate.getTime(),
				page: query.page,
				pageSize: query.pageSize,
			});
			const progress = await cycleDao.progressByCycle(
				orgId,
				items.map((item) => item.id),
			);
			return {
				items: items.map((cycle) =>
					toCycleWithProgress(cycle, progress.get(cycle.id), nowDate),
				),
				total,
				page: query.page,
				pageSize: query.pageSize,
			};
		},

		getCycle: async (
			orgId: string,
			projectId: string,
			cycleId: string,
		): Promise<CycleWithProgressDto> => {
			const cycle = await cycleDao.findForProject(orgId, projectId, cycleId);
			if (!cycle) {
				throw cycleNotFound(cycleId);
			}
			const progress = await cycleDao.progressByCycle(orgId, [cycle.id]);
			return toCycleWithProgress(cycle, progress.get(cycle.id));
		},

		createCycle: async (
			orgId: string,
			projectId: string,
			userId: string | null,
			input: CreateCycleInput,
		): Promise<CycleWithProgressDto> => {
			await requireProject(orgId, projectId);
			const startsAt = new Date(input.startsAt);
			const endsAt = new Date(input.endsAt);
			assertRange(startsAt, endsAt);
			// Overlap is advisory: D1/SQLite has no range-exclusion constraint,
			// so two concurrent creates can both pass this check (TOCTOU). The
			// unique (projectId, number) index still prevents duplicate
			// numbers, and a later update re-validates the range.
			await assertNoOverlap(orgId, projectId, startsAt, endsAt);
			let cycle: CycleDto;
			try {
				// `number` is per project and monotonic; cycles never renumber.
				cycle = await cycleDao.createWithNumber({
					id: crypto.randomUUID(),
					orgId,
					projectId,
					name: input.name,
					startsAt,
					endsAt,
					createdById: userId,
				});
			} catch (err) {
				if (isUniqueConstraintViolation(err)) {
					throw new ApiError(
						409,
						ApiErrorCode.CONFLICT,
						"Cycle number conflict; please retry",
					);
				}
				throw err;
			}
			return toCycleWithProgress(cycle);
		},

		updateCycle: async (
			orgId: string,
			projectId: string,
			cycleId: string,
			input: UpdateCycleInput,
		): Promise<CycleWithProgressDto> => {
			const cycle = await cycleDao.findForProject(orgId, projectId, cycleId);
			if (!cycle) {
				throw cycleNotFound(cycleId);
			}
			const startsAt =
				input.startsAt !== undefined ? new Date(input.startsAt) : undefined;
			const endsAt =
				input.endsAt !== undefined ? new Date(input.endsAt) : undefined;
			const nextStart = startsAt ?? new Date(cycle.startsAt);
			const nextEnd = endsAt ?? new Date(cycle.endsAt);
			assertRange(nextStart, nextEnd);
			if (startsAt || endsAt) {
				await assertNoOverlap(orgId, projectId, nextStart, nextEnd, cycle.id);
			}
			const updated = await cycleDao.update(orgId, cycle.id, {
				name: input.name,
				startsAt,
				endsAt,
			});
			if (!updated) {
				throw cycleNotFound(cycleId);
			}
			const progress = await cycleDao.progressByCycle(orgId, [updated.id]);
			return toCycleWithProgress(updated, progress.get(updated.id));
		},

		/**
		 * Deletes the cycle. Its issues are detached (cycleId = null) instead of
		 * being deleted, by the FK (`set null`) and explicitly in the dao batch,
		 * which also records one cycle activity row per detached issue.
		 */
		deleteCycle: async (
			orgId: string,
			projectId: string,
			cycleId: string,
			userId: string,
		): Promise<void> => {
			const cycle = await cycleDao.findForProject(orgId, projectId, cycleId);
			if (!cycle) {
				throw cycleNotFound(cycleId);
			}
			const deleted = await cycleDao.delete(orgId, cycle.id, {
				actorId: userId,
				sourceName: cycle.name,
			});
			if (!deleted) {
				throw cycleNotFound(cycleId);
			}
		},

		/**
		 * Moves every non-terminal issue from this cycle to the target cycle
		 * (same project, not yet ended) and returns how many issues moved.
		 */
		rolloverCycle: async (
			orgId: string,
			projectId: string,
			cycleId: string,
			userId: string,
			input: RolloverCycleInput,
		): Promise<CycleRolloverDto> => {
			const source = await cycleDao.findForProject(orgId, projectId, cycleId);
			if (!source) {
				throw cycleNotFound(cycleId);
			}
			const target = await cycleDao.findForProject(
				orgId,
				projectId,
				input.targetCycleId,
			);
			if (!target) {
				throw cycleNotFound(input.targetCycleId);
			}
			if (target.id === source.id) {
				throw new ApiError(
					400,
					ApiErrorCode.CYCLE_TARGET_INVALID,
					"Target cycle must be different from the source cycle",
				);
			}
			// Same inclusive end-day rule as `cycleStatus`: a target ending
			// exactly now is still rollable into.
			if (toMs(target.endsAt) < now().getTime()) {
				throw new ApiError(
					400,
					ApiErrorCode.CYCLE_TARGET_INVALID,
					"Target cycle has already ended",
				);
			}
			const moved = await cycleDao.rollover({
				orgId,
				projectId,
				sourceCycleId: source.id,
				targetCycleId: target.id,
				actorId: userId,
				sourceName: source.name,
				targetName: target.name,
			});
			return {
				sourceCycleId: source.id,
				targetCycleId: target.id,
				moved,
			};
		},
	};
};

export type CycleService = ReturnType<typeof createCycleService>;
