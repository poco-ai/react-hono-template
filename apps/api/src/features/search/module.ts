import type { FeatureModule } from "../../core/compose";
import { createSearchDao } from "./dao/search.dao";
import { createSearchRoutes } from "./routes/search";
import { createSearchService } from "./services/search.service";

/** Full-text search over issues and comments (FTS5 virtual tables). */
export const searchModule = {
	id: "search",
	register: (ctx) => {
		const searchService = createSearchService(createSearchDao(ctx.db));
		return {
			services: { searchService },
			routes: [
				{
					phase: "org",
					create: () => createSearchRoutes(searchService),
				},
			],
		};
	},
} satisfies FeatureModule;

export type SearchContribution = ReturnType<typeof searchModule.register>;
