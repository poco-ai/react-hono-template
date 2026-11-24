import { Button } from "@workspace/ui/components/button";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFavoriteState } from "@/features/favorites/use-favorite";
import type { IssueDetailContext } from "@/features/web-types";

/** Favorite star in the issue detail breadcrumb row. */
export function IssueFavoriteButton(
	context: IssueDetailContext & {
		archivedAt?: string | null;
	},
) {
	const { t } = useTranslation();
	const favorite = useFavoriteState(context.orgId, "issue", context.issueId);
	const label = context.archivedAt
		? t("favorites.archivedIssue")
		: t(favorite.favorited ? "favorites.removeIssue" : "favorites.addIssue");
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className="size-7 max-md:size-9"
			aria-label={label}
			aria-pressed={favorite.favorited}
			title={label}
			disabled={
				context.frozen || Boolean(context.archivedAt) || favorite.pending
			}
			onClick={favorite.toggle}
		>
			<Star className={favorite.favorited ? "fill-current" : undefined} />
		</Button>
	);
}
