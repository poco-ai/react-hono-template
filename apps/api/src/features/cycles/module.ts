import type { FeatureModule } from "../../core/compose";
import type { CycleGuard } from "../../core/lib/ports/cycle-guard";
import type { ProjectsContribution } from "../projects/module";
import { createCycleDao } from "./dao/cycle.dao";
import { createCyclesRoutes } from "./routes/cycles";
import {
	assertCycleAssignable,
	createCycleService,
} from "./services/cycle.service";

export type CyclesDaos = { cycleDao: ReturnType<typeof createCycleDao> };

/**
 * Cycles: time-boxed iterations per project. The issue service's cycle
 * guard port wraps this feature's dao + validation; the guard travels as an
 * extra so `issues/module.ts` never imports this slice.
 */
export const cyclesModule = {
	id: "cycles",
	createDaos: ({ db }) => ({ cycleDao: createCycleDao(db) }),
	register: (ctx) => {
		const cycleService = createCycleService({
			cycleDao: ctx.daos.cycleDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
		});
		const cycleDao = ctx.daos.cycleDao;
		const cycleGuard: CycleGuard = {
			assertCycleAssignable: (orgId, projectId, cycleId) =>
				assertCycleAssignable(cycleDao, orgId, projectId, cycleId),
			findById: (orgId, cycleId) => cycleDao.findById(orgId, cycleId),
			listAllByProject: (orgId, projectId) =>
				cycleDao.listAllByProject(orgId, projectId),
		};
		return {
			services: { cycleService },
			routes: [
				{
					phase: "org",
					create: () => createCyclesRoutes(cycleService),
				},
			],
			extras: { cycleGuard },
		};
	},
} satisfies FeatureModule<CyclesDaos>;

export type CyclesContribution = ReturnType<typeof cyclesModule.register> & {
	daos: CyclesDaos;
};
