import type { FavoriteItemDto } from "@api/dto/favorite.dto";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { StatusCategory } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemMedia,
} from "@workspace/ui/components/item";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CircleAlert, Folder, Star, StarOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { favoritesQuery, useRemoveFavorite } from "@/features/favorites/data";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { ProjectHealthBadge } from "@/features/projects/components/project-health-badge";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

const SKELETON_ROWS = ["row-1", "row-2", "row-3"];

/**
 * Favorites page: the member's pinned issues and projects, split into two
 * sections. The API drops favorites whose issue/project was deleted, archived
 * or moved out of reach, so dangling rows never reach this view; removing a
 * favorite that already disappeared is idempotent.
 */
export function FavoritesPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("favorites.title"));
	const navigate = useNavigate();
	const frozen = useOrgFrozen(orgId);
	const favorites = useQuery(favoritesQuery(orgId));
	const remove = useRemoveFavorite(orgId, {
		onSuccess: () => toast.success(t("favorites.removed")),
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});

	const items = favorites.data ?? [];
	const issues = items.filter(
		(
			item,
		): item is FavoriteItemDto & {
			issue: NonNullable<FavoriteItemDto["issue"]>;
		} => item.issue !== null,
	);
	const projects = items.filter(
		(
			item,
		): item is FavoriteItemDto & {
			project: NonNullable<FavoriteItemDto["project"]>;
		} => item.project !== null,
	);

	const openIssue = (item: FavoriteItemDto) => {
		if (!item.issue) {
			return;
		}
		void navigate({
			to: "/orgs/$orgId/projects/$projectId/$issueNumber",
			params: {
				orgId,
				projectId: item.issue.projectId,
				issueNumber: String(item.issue.number),
			},
		});
	};

	const openProject = (item: FavoriteItemDto) => {
		if (!item.project) {
			return;
		}
		void navigate({
			to: "/orgs/$orgId/projects/$projectId",
			params: { orgId, projectId: item.project.id },
			search: { page: 1, sort: "updated" },
		});
	};

	const removeFavorite = (item: FavoriteItemDto) =>
		remove.mutate({ entityType: item.entityType, entityId: item.entityId });

	if (favorites.isPending) {
		return (
			<div className="mx-auto w-full max-w-3xl px-6 py-8">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("favorites.title")}
				</h1>
				<ItemGroup className="mt-6" aria-busy="true" aria-hidden="true">
					{SKELETON_ROWS.map((key) => (
						<Item key={key} variant="outline" className="gap-3">
							<Skeleton className="size-8 shrink-0 rounded-md" />
							<div className="flex min-w-0 flex-1 flex-col gap-2">
								<Skeleton className="h-4 w-2/3" />
								<Skeleton className="h-3 w-1/3" />
							</div>
						</Item>
					))}
				</ItemGroup>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("favorites.title")}
				</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					{t("favorites.description")}
				</p>
			</div>

			{favorites.isError ? (
				<Alert variant="destructive" className="mt-6">
					<CircleAlert />
					<AlertDescription className="flex flex-col items-start gap-2">
						{apiErrorMessage(t, favorites.error)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => void favorites.refetch()}
						>
							{t("common.retry")}
						</Button>
					</AlertDescription>
				</Alert>
			) : null}

			{!favorites.isError && items.length === 0 ? (
				<EmptyState
					icon={Star}
					title={t("favorites.empty")}
					description={t("favorites.emptyDescription")}
				/>
			) : null}

			{issues.length > 0 ? (
				<section className="mt-8">
					<h2 className="text-muted-foreground text-sm font-medium">
						{t("favorites.issues", { count: issues.length })}
					</h2>
					<ItemGroup className="mt-3">
						{issues.map((item) => (
							<Item
								key={item.id}
								variant="outline"
								className="gap-3"
								aria-label={item.issue.identifier}
							>
								<ItemMedia>
									<StatusBadge
										status={{
											name: item.issue.statusName,
											color: item.issue.statusColor,
											category: item.issue.statusCategory as StatusCategory,
										}}
									/>
								</ItemMedia>
								<ItemContent
									role="link"
									tabIndex={0}
									className="cursor-pointer gap-1"
									onClick={() => openIssue(item)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											openIssue(item);
										}
									}}
								>
									<span className="flex min-w-0 items-center gap-2">
										<Badge
											variant="outline"
											className="shrink-0 rounded-md font-mono"
										>
											{item.issue.identifier}
										</Badge>
										<span className="truncate text-sm font-medium">
											{item.issue.title}
										</span>
									</span>
									<span className="text-muted-foreground text-xs">
										{item.issue.projectKey}
									</span>
								</ItemContent>
								<ItemActions>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("favorites.removeIssue")}
										title={t("favorites.removeIssue")}
										disabled={frozen || remove.isPending}
										onClick={() => removeFavorite(item)}
									>
										<StarOff />
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
				</section>
			) : null}

			{projects.length > 0 ? (
				<section className="mt-8">
					<h2 className="text-muted-foreground text-sm font-medium">
						{t("favorites.projects", { count: projects.length })}
					</h2>
					<ItemGroup className="mt-3">
						{projects.map((item) => (
							<Item key={item.id} variant="outline" className="gap-3">
								<ItemMedia>
									<Folder className="text-muted-foreground size-4" />
								</ItemMedia>
								<ItemContent
									role="link"
									tabIndex={0}
									className="cursor-pointer gap-1"
									onClick={() => openProject(item)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											openProject(item);
										}
									}}
								>
									<span className="flex min-w-0 items-center gap-2">
										<span className="truncate text-sm font-medium">
											{item.project.name}
										</span>
										<Badge
											variant="outline"
											className="shrink-0 rounded-md font-mono"
										>
											{item.project.key}
										</Badge>
									</span>
									<span className="flex items-center gap-2">
										<ProjectHealthBadge health={item.project.health} />
									</span>
								</ItemContent>
								<ItemActions>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("favorites.removeProject")}
										title={t("favorites.removeProject")}
										disabled={frozen || remove.isPending}
										onClick={() => removeFavorite(item)}
									>
										<StarOff />
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
				</section>
			) : null}
		</div>
	);
}
