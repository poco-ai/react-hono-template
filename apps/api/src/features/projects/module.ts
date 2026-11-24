import type { FeatureModule } from "../../core/compose";
import { createProjectDao } from "./dao/project.dao";
import { createProjectsRoutes } from "./routes/projects";
import { createProjectService } from "./services/project.service";

export type ProjectsDaos = { projectDao: ReturnType<typeof createProjectDao> };

/** Projects: the workspace unit issues, cycles and views hang off. */
export const projectsModule = {
	id: "projects",
	createDaos: ({ db }) => ({ projectDao: createProjectDao(db) }),
	register: (ctx) => {
		const projectService = createProjectService({
			projectDao: ctx.daos.projectDao,
			plans: ctx.core.planService,
			memberDao: ctx.daos.memberDao,
		});
		return {
			services: { projectService },
			routes: [
				{
					phase: "org",
					create: () => createProjectsRoutes(projectService),
				},
			],
		};
	},
} satisfies FeatureModule<ProjectsDaos>;

export type ProjectsContribution = ReturnType<
	typeof projectsModule.register
> & {
	daos: ProjectsDaos;
};
