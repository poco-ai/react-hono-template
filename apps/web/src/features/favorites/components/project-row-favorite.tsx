import { Button } from "@workspace/ui/components/button";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFavoriteState } from "@/features/favorites/use-favorite";
import type { ProjectRowContext } from "@/features/web-types";

/** Favorite star rendered on each project list row. */
export function ProjectRowFavorite({
	orgId,
	project,
	frozen,
}: ProjectRowContext) {
	const { t } = useTranslation();
	const favorite = useFavoriteState(orgId, "project", project.id);
	const label = project.archived
		? t("favorites.archivedProject")
		: t(
				favorite.favorited ? "favorites.removeProject" : "favorites.addProject",
			);
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label={label}
			aria-pressed={favorite.favorited}
			title={label}
			disabled={frozen || project.archived || favorite.pending}
			className="shrink-0"
			onClick={(event) => {
				event.stopPropagation();
				favorite.toggle();
			}}
		>
			<Star className={favorite.favorited ? "fill-current" : undefined} />
		</Button>
	);
}
