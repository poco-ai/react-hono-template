import type { FeatureModule } from "../../core/compose";
import type { ProjectsContribution } from "../projects/module";
import { createViewDao } from "./dao/view.dao";
import { createViewsRoutes } from "./routes/views";
import { createViewService } from "./services/view.service";

export type ViewsDaos = { viewDao: ReturnType<typeof createViewDao> };

/** Saved issue views (plan-gated). */
export const viewsModule = {
	id: "views",
	createDaos: ({ db }) => ({ viewDao: createViewDao(db) }),
	register: (ctx) => {
		const viewService = createViewService({
			viewDao: ctx.daos.viewDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			plans: ctx.core.planService,
		});
		return {
			services: { viewService },
			routes: [
				{
					phase: "org",
					create: () => createViewsRoutes(viewService),
				},
			],
		};
	},
} satisfies FeatureModule<ViewsDaos>;

export type ViewsContribution = ReturnType<typeof viewsModule.register> & {
	daos: ViewsDaos;
};
