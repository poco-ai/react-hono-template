import type { FeatureModule } from "../../core/compose";
import { createStatusDao } from "./dao/status.dao";
import { createStatusesRoutes } from "./routes/statuses";
import { createStatusService } from "./services/status.service";

export type StatusesDaos = { statusDao: ReturnType<typeof createStatusDao> };

/**
 * Issue statuses. Contributes the `onOrgCreated` hook that seeds the
 * default status rows for every new organization (consumed by the auth
 * layer's organization-creation callback).
 */
export const statusesModule = {
	id: "statuses",
	createDaos: ({ db }) => ({ statusDao: createStatusDao(db) }),
	register: (ctx) => {
		const statusService = createStatusService(ctx.daos.statusDao);
		return {
			services: { statusService },
			routes: [
				{
					phase: "org",
					create: () => createStatusesRoutes(statusService),
				},
			],
			onOrgCreated: [
				async (orgId) => {
					await statusService.ensureDefaultStatuses(orgId);
				},
			],
		};
	},
} satisfies FeatureModule<StatusesDaos>;

export type StatusesContribution = ReturnType<
	typeof statusesModule.register
> & {
	daos: StatusesDaos;
};
