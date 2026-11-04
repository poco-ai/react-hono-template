import {
	ApiError,
	ApiErrorCode,
	type CreateProjectUpdateInput,
	type ProjectUpdateListQuery,
	type UpdateProjectUpdateInput,
} from "@workspace/shared";
import type { ProjectDao } from "../dao/project.dao";
import type { ProjectUpdateDao } from "../dao/project-update.dao";
import type {
	ListProjectUpdatesDto,
	ProjectUpdateDto,
} from "../dto/project-update.dto";

/** Roles that may edit/delete any project update, not just their own. */
const MODERATOR_ROLES = new Set(["owner", "admin"]);

const updateNotFound = (id: string) =>
	new ApiError(
		404,
		ApiErrorCode.PROJECT_UPDATE_NOT_FOUND,
		`Project update ${id} not found`,
	);

export const createProjectUpdateService = ({
	updateDao,
	projectDao,
}: {
	updateDao: ProjectUpdateDao;
	projectDao: Pick<ProjectDao, "findById">;
}) => {
	const requireProject = async (orgId: string, projectId: string) => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		return project;
	};

	const requireUpdate = async (
		orgId: string,
		projectId: string,
		updateId: string,
	) => {
		const update = await updateDao.findForProject(orgId, projectId, updateId);
		if (!update) {
			throw updateNotFound(updateId);
		}
		return update;
	};

	const assertCanManage = (
		update: ProjectUpdateDto,
		actor: { userId: string; role: string },
	) => {
		if (update.authorId === actor.userId || MODERATOR_ROLES.has(actor.role)) {
			return;
		}
		throw new ApiError(
			403,
			ApiErrorCode.FORBIDDEN,
			"Only the author or an organization admin can change this update",
		);
	};

	return {
		listUpdates: async (
			orgId: string,
			projectId: string,
			query: ProjectUpdateListQuery,
		): Promise<ListProjectUpdatesDto> => {
			await requireProject(orgId, projectId);
			return updateDao.listByProject(orgId, projectId, {
				page: query.page,
				pageSize: query.pageSize,
			});
		},

		createUpdate: async (
			orgId: string,
			projectId: string,
			userId: string | null,
			input: CreateProjectUpdateInput,
		): Promise<ProjectUpdateDto> => {
			await requireProject(orgId, projectId);
			return updateDao.create({
				id: crypto.randomUUID(),
				orgId,
				projectId,
				authorId: userId,
				body: input.body,
				health: input.health ?? null,
			});
		},

		updateUpdate: async (
			orgId: string,
			projectId: string,
			updateId: string,
			actor: { userId: string; role: string },
			input: UpdateProjectUpdateInput,
		): Promise<ProjectUpdateDto> => {
			const update = await requireUpdate(orgId, projectId, updateId);
			assertCanManage(update, actor);
			const updated = await updateDao.update(orgId, projectId, update.id, {
				body: input.body,
				health: "health" in input ? (input.health ?? null) : undefined,
			});
			if (!updated) {
				throw updateNotFound(updateId);
			}
			return updated;
		},

		deleteUpdate: async (
			orgId: string,
			projectId: string,
			updateId: string,
			actor: { userId: string; role: string },
		): Promise<void> => {
			const update = await requireUpdate(orgId, projectId, updateId);
			assertCanManage(update, actor);
			const deleted = await updateDao.delete(orgId, projectId, update.id);
			if (!deleted) {
				throw updateNotFound(updateId);
			}
		},
	};
};

export type ProjectUpdateService = ReturnType<
	typeof createProjectUpdateService
>;
