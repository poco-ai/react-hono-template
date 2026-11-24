import type { FeatureModule } from "../../core/compose";
import type { IssuesContribution } from "../issues/module";
import type { ProjectsContribution } from "../projects/module";
import type { WebhooksContribution } from "../webhooks/module";
import { createRelationDao } from "./dao/relation.dao";
import { createRelationsRoutes } from "./routes/relations";
import { createRelationService } from "./services/relation.service";

export type RelationsDaos = {
	relationDao: ReturnType<typeof createRelationDao>;
};

/** Issue relations (blocks/blocked-by/relates-to). */
export const relationsModule = {
	id: "relations",
	createDaos: ({ db }) => ({ relationDao: createRelationDao(db) }),
	register: (ctx) => {
		const relationService = createRelationService({
			relationDao: ctx.daos.relationDao,
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			webhooks:
				ctx.features.get<WebhooksContribution>("webhooks").services
					.webhookDeliveryService,
		});
		return {
			services: { relationService },
			routes: [
				{
					phase: "org",
					create: () => createRelationsRoutes(relationService),
				},
			],
		};
	},
} satisfies FeatureModule<RelationsDaos>;

export type RelationsContribution = ReturnType<
	typeof relationsModule.register
> & {
	daos: RelationsDaos;
};
