import { Button } from "@workspace/ui/components/button";
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFavoriteState } from "@/features/favorites/use-favorite";
import type { ProjectPageContext } from "@/features/web-types";

function useProjectFavorite(context: ProjectPageContext) {
	const { t } = useTranslation();
	const project = context.project;
	const favorite = useFavoriteState(context.orgId, "project", project?.id);
	const archived = Boolean(project?.archived);
	const label = archived
		? t("favorites.archivedProject")
		: t(
				favorite.favorited ? "favorites.removeProject" : "favorites.addProject",
			);
	const disabled = !project || archived || context.frozen || favorite.pending;
	return { favorite, label, disabled };
}

/** Desktop project header star (hidden below md; the menu item covers mobile). */
export function ProjectFavoriteButton(context: ProjectPageContext) {
	const { favorite, label, disabled } = useProjectFavorite(context);
	return (
		<Button
			variant="outline"
			size="icon-sm"
			className="hidden md:inline-flex"
			aria-label={label}
			aria-pressed={favorite.favorited}
			title={label}
			disabled={disabled}
			onClick={favorite.toggle}
		>
			<Star className={favorite.favorited ? "fill-current" : undefined} />
		</Button>
	);
}

/** Mobile overflow menu star row. */
export function ProjectFavoriteMenuItem(context: ProjectPageContext) {
	const { favorite, label, disabled } = useProjectFavorite(context);
	return (
		<DropdownMenuItem disabled={disabled} onClick={favorite.toggle}>
			<Star className={favorite.favorited ? "fill-current" : undefined} />
			{label}
		</DropdownMenuItem>
	);
}
