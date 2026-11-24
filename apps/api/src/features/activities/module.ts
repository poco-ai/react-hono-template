import type { FeatureModule } from "../../core/compose";
import type { IssuesContribution } from "../issues/module";
import { createActivitiesRoutes } from "./routes/activities";
import { createActivityService } from "./services/activity.service";

/**
 * Activities: the org-wide issue history feed. The activity dao itself is
 * core-owned (the write path is core infrastructure), so this module only
 * contributes the read-side service and routes.
 */
export const activitiesModule = {
	id: "activities",
	register: (ctx) => {
		const activityService = createActivityService({
			activityDao: ctx.daos.activityDao,
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
		});
		return {
			services: { activityService },
			routes: [
				{
					phase: "org",
					create: () => createActivitiesRoutes(activityService),
				},
			],
		};
	},
} satisfies FeatureModule;

export type ActivitiesContribution = ReturnType<
	typeof activitiesModule.register
>;
