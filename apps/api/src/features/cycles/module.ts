import type { FeatureModule } from "../../core/compose";
import type { ProjectsContribution } from "../projects/module";
import { createCycleDao } from "./dao/cycle.dao";
import { createCyclesRoutes } from "./routes/cycles";
import { createCycleService } from "./services/cycle.service";

export type CyclesDaos = { cycleDao: ReturnType<typeof createCycleDao> };

/**
 * Cycles: time-boxed iterations per project. The issue service's cycle
 * guard port wraps this feature's dao + validation.
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
		return {
			services: { cycleService },
			routes: [
				{
					phase: "org",
					create: () => createCyclesRoutes(cycleService),
				},
			],
		};
	},
} satisfies FeatureModule<CyclesDaos>;

export type CyclesContribution = ReturnType<typeof cyclesModule.register> & {
	daos: CyclesDaos;
};
