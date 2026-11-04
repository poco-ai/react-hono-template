import {
	ApiError,
	ApiErrorCode,
	type CreateFavoriteInput,
} from "@workspace/shared";
import type { FavoriteDao } from "../dao/favorite.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { ProjectDao } from "../dao/project.dao";
import type {
	FavoriteDto,
	FavoriteIssueDto,
	FavoriteItemDto,
} from "../dto/favorite.dto";
import type { IssueDto } from "../dto/issue.dto";
import type { ProjectDto } from "../dto/project.dto";

type IssueSource = Pick<IssueDao, "findById" | "findByIds">;
type ProjectSource = Pick<ProjectDao, "findById" | "findByIds">;

/**
 * Personal favorites. The service validates that the entity lives in the same
 * organization and is still visible (not deleted/archived), then hydrates the
 * favorite with the fields the favorites list renders.
 */
export const createFavoriteService = ({
	favoriteDao,
	issueDao,
	projectDao,
}: {
	favoriteDao: FavoriteDao;
	issueDao: IssueSource;
	projectDao: ProjectSource;
}) => {
	const toIssueSummary = (
		issue: IssueDto,
		projectKey: string,
	): FavoriteIssueDto => ({
		id: issue.id,
		projectId: issue.projectId,
		projectKey,
		number: issue.number,
		identifier: `${projectKey}-${issue.number}`,
		title: issue.title,
		statusId: issue.statusId,
		statusName: issue.status.name,
		statusCategory: issue.status.category,
		statusColor: issue.status.color,
	});

	const toProjectSummary = (project: ProjectDto) => ({
		id: project.id,
		name: project.name,
		key: project.key,
		health: project.health,
		archived: project.archived,
	});

	/** Hydrates a batch of favorite rows; dangling/archived entities are dropped. */
	const hydrate = async (
		orgId: string,
		rows: FavoriteDto[],
	): Promise<FavoriteItemDto[]> => {
		if (rows.length === 0) {
			return [];
		}
		const issueIds = rows
			.filter((row) => row.entityType === "issue")
			.map((row) => row.entityId);
		const projectIds = rows
			.filter((row) => row.entityType === "project")
			.map((row) => row.entityId);
		const [issues, projects] = await Promise.all([
			issueDao.findByIds(orgId, issueIds),
			projectDao.findByIds(orgId, projectIds),
		]);
		const issueById = new Map(issues.map((issue) => [issue.id, issue]));
		const projectById = new Map(
			projects.map((project) => [project.id, project]),
		);
		// Issue favorites need their project's KEY for the display identifier.
		const issueProjectIds = [
			...new Set(issues.map((issue) => issue.projectId)),
		].filter((id) => !projectById.has(id));
		const issueProjects = await projectDao.findByIds(orgId, issueProjectIds);
		for (const project of issueProjects) {
			projectById.set(project.id, project);
		}

		const items: FavoriteItemDto[] = [];
		for (const row of rows) {
			if (row.entityType === "issue") {
				const issue = issueById.get(row.entityId);
				const project = issue ? projectById.get(issue.projectId) : undefined;
				if (!issue || issue.archivedAt || !project || project.archived) {
					continue;
				}
				items.push({
					...row,
					issue: toIssueSummary(issue, project.key),
					project: null,
				});
				continue;
			}
			const project = projectById.get(row.entityId);
			if (!project || project.archived) {
				continue;
			}
			items.push({
				...row,
				issue: null,
				project: toProjectSummary(project),
			});
		}
		return items;
	};

	/** Rejects unknown, cross-organization, deleted and archived entities. */
	const assertTargetVisible = async (
		orgId: string,
		input: CreateFavoriteInput,
	) => {
		if (input.entityType === "issue") {
			const issue = await issueDao.findById(orgId, input.entityId);
			if (!issue) {
				throw new ApiError(
					ApiErrorCode.ISSUE_NOT_FOUND,
					`Issue ${input.entityId} not found`,
				);
			}
			if (issue.archivedAt) {
				throw new ApiError(
					ApiErrorCode.CONFLICT,
					"Archived issues cannot be favorited",
				);
			}
			return;
		}
		const project = await projectDao.findById(orgId, input.entityId);
		if (!project) {
			throw new ApiError(
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${input.entityId} not found`,
			);
		}
		if (project.archived) {
			throw new ApiError(
				ApiErrorCode.CONFLICT,
				"Archived projects cannot be favorited",
			);
		}
	};

	return {
		listFavorites: async (
			orgId: string,
			userId: string,
		): Promise<FavoriteItemDto[]> =>
			hydrate(orgId, await favoriteDao.listByUser(orgId, userId)),

		/** Idempotent: favoriting twice returns the same row. */
		addFavorite: async (
			orgId: string,
			userId: string,
			input: CreateFavoriteInput,
		): Promise<FavoriteItemDto> => {
			await assertTargetVisible(orgId, input);
			const favorite = await favoriteDao.insertIfAbsent({
				id: crypto.randomUUID(),
				orgId,
				userId,
				entityType: input.entityType,
				entityId: input.entityId,
			});
			const [item] = await hydrate(orgId, [favorite]);
			if (!item) {
				// The entity disappeared between validation and hydration.
				throw new ApiError(ApiErrorCode.NOT_FOUND, "Favorite target not found");
			}
			return item;
		},

		/** Idempotent: removing a missing favorite still succeeds. */
		removeFavorite: async (
			orgId: string,
			userId: string,
			entityType: CreateFavoriteInput["entityType"],
			entityId: string,
		): Promise<{ removed: boolean }> => ({
			removed: await favoriteDao.remove(orgId, userId, entityType, entityId),
		}),
	};
};

export type FavoriteService = ReturnType<typeof createFavoriteService>;
