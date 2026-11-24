import type { FavoriteEntityType } from "@workspace/shared";

export type FavoriteDto = {
	id: string;
	orgId: string;
	userId: string;
	entityType: FavoriteEntityType;
	entityId: string;
	createdAt: string;
};

/** Issue details shown for a favorited issue. */
export type FavoriteIssueDto = {
	id: string;
	projectId: string;
	projectKey: string;
	number: number;
	identifier: string;
	title: string;
	statusId: string;
	statusName: string;
	statusCategory: string;
	statusColor: string;
};

/** Project details shown for a favorited project. */
export type FavoriteProjectDto = {
	id: string;
	name: string;
	key: string;
	health: string | null;
	archived: boolean;
};

/**
 * A favorite row plus the hydrated entity. `issue` and `project` are mutually
 * exclusive; a favorite whose entity was deleted (or became archived) is
 * dropped from the list instead of rendered as a dangling row.
 */
export type FavoriteItemDto = FavoriteDto & {
	issue: FavoriteIssueDto | null;
	project: FavoriteProjectDto | null;
};
