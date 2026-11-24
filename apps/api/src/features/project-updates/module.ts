import type { FeatureModule } from "../../core/compose";
import type { ProjectsContribution } from "../projects/module";
import { createProjectUpdateDao } from "./dao/project-update.dao";
import { createProjectUpdatesRoutes } from "./routes/project-updates";
import { createProjectUpdateService } from "./services/project-update.service";

export type ProjectUpdatesDaos = {
	projectUpdateDao: ReturnType<typeof createProjectUpdateDao>;
};

/** Project update posts (launch notes pinned to a project). */
export const projectUpdatesModule = {
	id: "project-updates",
	createDaos: ({ db }) => ({ projectUpdateDao: createProjectUpdateDao(db) }),
	register: (ctx) => {
		const projectUpdateService = createProjectUpdateService({
			updateDao: ctx.daos.projectUpdateDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
		});
		return {
			services: { projectUpdateService },
			routes: [
				{
					phase: "org",
					create: () => createProjectUpdatesRoutes(projectUpdateService),
				},
			],
		};
	},
} satisfies FeatureModule<ProjectUpdatesDaos>;

export type ProjectUpdatesContribution = ReturnType<
	typeof projectUpdatesModule.register
> & { daos: ProjectUpdatesDaos };
