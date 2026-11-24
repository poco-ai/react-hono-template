import type { FeatureModule } from "../../core/compose";
import type { CycleGuard } from "../../core/lib/ports/cycle-guard";
import type { IssueNotifications } from "../../core/lib/ports/notifications";
import type { WebhookDispatcher } from "../../core/lib/ports/webhook-dispatcher";
import type { LabelsContribution } from "../labels/module";
import type { ProjectsContribution } from "../projects/module";
import type { StatusesContribution } from "../statuses/module";
import { createIssueDao } from "./dao/issue.dao";
import { createIssuesRoutes } from "./routes/issues";
import { createIssueService } from "./services/issue.service";

export type IssuesDaos = { issueDao: ReturnType<typeof createIssueDao> };

/**
 * Issues: the tracker's core resource. Webhook fan-out, notifications and
 * the cycle guard arrive through Phase 1 ports and are looked up optionally:
 * a preset without planning/webhooks keeps the issue workflow fully usable.
 */
export const issuesModule = {
	id: "issues",
	createDaos: ({ db }) => ({ issueDao: createIssueDao(db) }),
	register: (ctx) => {
		const cycles = ctx.features.find<{
			extras?: { cycleGuard?: CycleGuard };
		}>("cycles");
		const webhooks = ctx.features.find<{
			services: { webhookDeliveryService: WebhookDispatcher };
		}>("webhooks");
		const notifications = ctx.features.find<{
			services: { notificationService: IssueNotifications };
		}>("notifications");

		const webhookDispatcher = webhooks?.services.webhookDeliveryService;
		const notificationService = notifications?.services.notificationService;

		const issueService = createIssueService({
			issueDao: ctx.daos.issueDao,
			labelDao: ctx.features.get<LabelsContribution>("labels").daos.labelDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			memberDao: ctx.daos.memberDao,
			cycleGuard: cycles?.extras?.cycleGuard,
			statusService:
				ctx.features.get<StatusesContribution>("statuses").services
					.statusService,
			webhooks: webhookDispatcher,
			notifications: notificationService,
		});
		return {
			services: { issueService },
			routes: [
				{
					phase: "org",
					create: () => createIssuesRoutes(issueService),
				},
			],
		};
	},
} satisfies FeatureModule<IssuesDaos>;

export type IssuesContribution = ReturnType<typeof issuesModule.register> & {
	daos: IssuesDaos;
};
