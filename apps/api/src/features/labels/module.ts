import type { FeatureModule } from "../../core/compose";
import { createLabelDao } from "./dao/label.dao";
import { createLabelsRoutes } from "./routes/labels";
import { createLabelService } from "./services/label.service";

export type LabelsDaos = { labelDao: ReturnType<typeof createLabelDao> };

/** Labels: org-scoped issue labels with KV-backed list caching. */
export const labelsModule = {
	id: "labels",
	createDaos: ({ db }) => ({ labelDao: createLabelDao(db) }),
	register: (ctx) => {
		const labelService = createLabelService(ctx.daos.labelDao, ctx.cache);
		return {
			services: { labelService },
			routes: [
				{
					phase: "org",
					create: () => createLabelsRoutes(labelService),
				},
			],
		};
	},
} satisfies FeatureModule<LabelsDaos>;

export type LabelsContribution = ReturnType<typeof labelsModule.register> & {
	daos: LabelsDaos;
};
