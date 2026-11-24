import type { FeatureModule } from "../../core/compose";
import type { IssuesContribution } from "../issues/module";
import type { ProjectsContribution } from "../projects/module";
import { createFavoriteDao } from "./dao/favorite.dao";
import { createFavoritesRoutes } from "./routes/favorites";
import { createFavoriteService } from "./services/favorite.service";

export type FavoritesDaos = {
	favoriteDao: ReturnType<typeof createFavoriteDao>;
};

/** Issue favorites (my-issues pinning). */
export const favoritesModule = {
	id: "favorites",
	createDaos: ({ db }) => ({ favoriteDao: createFavoriteDao(db) }),
	register: (ctx) => {
		const favoriteService = createFavoriteService({
			favoriteDao: ctx.daos.favoriteDao,
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
		});
		return {
			services: { favoriteService },
			routes: [
				{
					phase: "org",
					create: () => createFavoritesRoutes(favoriteService),
				},
			],
		};
	},
} satisfies FeatureModule<FavoritesDaos>;

export type FavoritesContribution = ReturnType<
	typeof favoritesModule.register
> & {
	daos: FavoritesDaos;
};
