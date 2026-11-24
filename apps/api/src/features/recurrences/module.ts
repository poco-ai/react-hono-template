import type { FeatureModule, ScheduledJob } from "../../core/compose";
import type { IssuesContribution } from "../issues/module";
import type { LabelsContribution } from "../labels/module";
import type { NotificationsContribution } from "../notifications/module";
import type { ProjectsContribution } from "../projects/module";
import type { StatusesContribution } from "../statuses/module";
import type { WebhooksContribution } from "../webhooks/module";
import { createRecurrenceDao } from "./dao/recurrence.dao";
import { createRecurrencesRoutes } from "./routes/recurrences";
import { createRecurrenceService } from "./services/recurrence.service";

export type RecurrencesDaos = {
	recurrenceDao: ReturnType<typeof createRecurrenceDao>;
};

/**
 * Issue recurrences: scheduled re-creation of issues. Owns the second cron
 * job (processDue) with its historical log format.
 */
export const createRecurrenceScheduledJob = (
	recurrences: Pick<ReturnType<typeof createRecurrenceService>, "processDue">,
): ScheduledJob => ({
	name: "recurrences",
	run: async (now, background) => {
		const counts = await recurrences.processDue(now, background);
		console.log(
			`[cron] recurrences created=${counts.created} skipped=${counts.skipped} failed=${counts.failed}`,
		);
	},
	failureMessage: "[cron] recurrence processing failed:",
});

export const recurrencesModule = {
	id: "recurrences",
	createDaos: ({ db }) => ({ recurrenceDao: createRecurrenceDao(db) }),
	register: (ctx) => {
		const recurrenceService = createRecurrenceService({
			recurrenceDao: ctx.daos.recurrenceDao,
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			labelDao: ctx.features.get<LabelsContribution>("labels").daos.labelDao,
			memberDao: ctx.daos.memberDao,
			statusService:
				ctx.features.get<StatusesContribution>("statuses").services
					.statusService,
			notifications:
				ctx.features.get<NotificationsContribution>("notifications").services
					.notificationService,
			webhooks:
				ctx.features.get<WebhooksContribution>("webhooks").services
					.webhookDeliveryService,
		});
		return {
			services: { recurrenceService },
			routes: [
				{
					phase: "org",
					create: () => createRecurrencesRoutes(recurrenceService),
				},
			],
			scheduledJobs: [createRecurrenceScheduledJob(recurrenceService)],
		};
	},
} satisfies FeatureModule<RecurrencesDaos>;

export type RecurrencesContribution = ReturnType<
	typeof recurrencesModule.register
> & { daos: RecurrencesDaos };
