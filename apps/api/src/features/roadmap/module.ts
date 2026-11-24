import type { FeatureModule } from "../../core/compose";
import { createRoadmapDao } from "./dao/roadmap.dao";
import { createRoadmapRoutes } from "./routes/roadmap";
import { createRoadmapService } from "./services/roadmap.service";

export type RoadmapDaos = { roadmapDao: ReturnType<typeof createRoadmapDao> };

/** Roadmap: derived timeline over projects and cycles. */
export const roadmapModule = {
	id: "roadmap",
	createDaos: ({ db }) => ({ roadmapDao: createRoadmapDao(db) }),
	register: (ctx) => {
		const roadmapService = createRoadmapService({
			roadmapDao: ctx.daos.roadmapDao,
		});
		return {
			services: { roadmapService },
			routes: [
				{
					phase: "org",
					create: () => createRoadmapRoutes(roadmapService),
				},
			],
		};
	},
} satisfies FeatureModule<RoadmapDaos>;

export type RoadmapContribution = ReturnType<typeof roadmapModule.register> & {
	daos: RoadmapDaos;
};
