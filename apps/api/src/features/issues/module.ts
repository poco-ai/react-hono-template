import type { FeatureModule } from "../../core/compose";
import type { CycleGuard } from "../../core/lib/ports/cycle-guard";
import type { CyclesContribution } from "../cycles/module";
import { assertCycleAssignable } from "../cycles/services/cycle.service";
import type { LabelsContribution } from "../labels/module";
import type { NotificationsContribution } from "../notifications/module";
import type { ProjectsContribution } from "../projects/module";
import type { StatusesContribution } from "../statuses/module";
import type { WebhooksContribution } from "../webhooks/module";
import { createIssueDao } from "./dao/issue.dao";
import { createIssuesRoutes } from "./routes/issues";
import { createIssueService } from "./services/issue.service";

export type IssuesDaos = { issueDao: ReturnType<typeof createIssueDao> };

/**
 * Issues: the tracker's core resource. Webhook fan-out, notifications and
 * the cycle guard arrive through Phase 1 ports; the cycles feature is
 * soft-optional (absent in presets without planning).
 */
export const issuesModule = {
	id: "issues",
	createDaos: ({ db }) => ({ issueDao: createIssueDao(db) }),
	register: (ctx) => {
		const cycleDao =
			ctx.features.get<CyclesContribution>("cycles").daos.cycleDao;
		// Cycle guard adapter: the planning feature's validation wrapped for
		// the issue service port (absent in presets without cycles).
		const cycleGuard: CycleGuard = {
			assertCycleAssignable: (orgId, projectId, cycleId) =>
				assertCycleAssignable(cycleDao, orgId, projectId, cycleId),
			findById: (orgId, cycleId) => cycleDao.findById(orgId, cycleId),
			listAllByProject: (orgId, projectId) =>
				cycleDao.listAllByProject(orgId, projectId),
		};
		const issueService = createIssueService({
			issueDao: ctx.daos.issueDao,
			labelDao: ctx.features.get<LabelsContribution>("labels").daos.labelDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			memberDao: ctx.daos.memberDao,
			cycleGuard,
			statusService:
				ctx.features.get<StatusesContribution>("statuses").services
					.statusService,
			webhooks:
				ctx.features.get<WebhooksContribution>("webhooks").services
					.webhookDeliveryService,
			notifications:
				ctx.features.get<NotificationsContribution>("notifications").services
					.notificationService,
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
