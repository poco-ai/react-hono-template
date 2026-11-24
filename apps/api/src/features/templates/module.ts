import type { FeatureModule } from "../../core/compose";
import type { LabelsContribution } from "../labels/module";
import type { ProjectsContribution } from "../projects/module";
import type { StatusesContribution } from "../statuses/module";
import { createIssueTemplateDao } from "./dao/issue-template.dao";
import { createIssueTemplatesRoutes } from "./routes/issue-templates";
import { createIssueTemplateService } from "./services/issue-template.service";

export type TemplatesDaos = {
	issueTemplateDao: ReturnType<typeof createIssueTemplateDao>;
};

/** Issue templates: pre-filled issue blueprints per project. */
export const templatesModule = {
	id: "templates",
	createDaos: ({ db }) => ({ issueTemplateDao: createIssueTemplateDao(db) }),
	register: (ctx) => {
		const issueTemplateService = createIssueTemplateService({
			templateDao: ctx.daos.issueTemplateDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			statusDao:
				ctx.features.get<StatusesContribution>("statuses").daos.statusDao,
			labelDao: ctx.features.get<LabelsContribution>("labels").daos.labelDao,
		});
		return {
			services: { issueTemplateService },
			routes: [
				{
					phase: "org",
					create: () => createIssueTemplatesRoutes(issueTemplateService),
				},
			],
		};
	},
} satisfies FeatureModule<TemplatesDaos>;

export type TemplatesContribution = ReturnType<
	typeof templatesModule.register
> & {
	daos: TemplatesDaos;
};
