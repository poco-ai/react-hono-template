import {
	ApiError,
	ApiErrorCode,
	type CreateViewInput,
	ISSUE_QUERY_LAYOUTS,
	type UpdateViewInput,
} from "@workspace/shared";
import type { ProjectDao } from "../dao/project.dao";
import type { ViewDao } from "../dao/view.dao";
import type { ViewDto } from "../dto/view.dto";
import type { PlanService } from "./plan.service";

const ADMIN_ROLES = new Set(["owner", "admin"]);

const isAdmin = (role: string) => ADMIN_ROLES.has(role);

const assertLayout = (layout: string) => {
	if (!(ISSUE_QUERY_LAYOUTS as readonly string[]).includes(layout)) {
		throw new ApiError(
			400,
			ApiErrorCode.VALIDATION,
			`Layout must be one of ${ISSUE_QUERY_LAYOUTS.join(", ")}`,
		);
	}
};

export const createViewService = ({
	viewDao,
	projectDao,
	plans,
}: {
	viewDao: ViewDao;
	projectDao: Pick<ProjectDao, "findById">;
	plans: Pick<PlanService, "getLimitsForOrg">;
}) => {
	const assertProjectInOrg = async (
		orgId: string,
		projectId: string | null | undefined,
	) => {
		if (!projectId) {
			return;
		}
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
	};

	const requireView = async (
		orgId: string,
		viewId: string,
	): Promise<ViewDto> => {
		const view = await viewDao.findById(orgId, viewId);
		if (!view) {
			throw new ApiError(
				404,
				ApiErrorCode.VIEW_NOT_FOUND,
				`View ${viewId} not found`,
			);
		}
		return view;
	};

	/**
	 * Personal views are owner-only; another member's personal view is hidden
	 * behind a 404 so its existence does not leak. Shared views are editable by
	 * the owner or an organization owner/admin.
	 */
	const assertCanMutate = (view: ViewDto, userId: string, role: string) => {
		if (view.ownerId === userId) {
			return;
		}
		if (view.shared) {
			if (isAdmin(role)) {
				return;
			}
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"Only the owner or an organization owner/admin can modify a shared view",
			);
		}
		throw new ApiError(
			404,
			ApiErrorCode.VIEW_NOT_FOUND,
			`View ${view.id} not found`,
		);
	};

	const assertShareAllowed = (role: string) => {
		if (!isAdmin(role)) {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"Only organization owners or admins can share views",
			);
		}
	};

	/**
	 * Personal views count against the plan quota. Shared views are unmetered,
	 * so turning a shared view back into a personal one (or creating one) must
	 * go through the same check; otherwise the limit is trivially bypassed.
	 */
	const assertPersonalQuota = async (orgId: string, ownerId: string) => {
		const limits = await plans.getLimitsForOrg(orgId);
		if (limits.savedViews < 0) {
			return;
		}
		const current = await viewDao.countPersonal(orgId, ownerId);
		if (current >= limits.savedViews) {
			throw new ApiError(
				403,
				ApiErrorCode.VIEW_LIMIT_REACHED,
				`Your plan allows up to ${limits.savedViews} personal views. Upgrade to save more, or ask an owner/admin to share one.`,
			);
		}
	};

	return {
		listViews: async (
			orgId: string,
			userId: string,
			query: { projectId?: string } = {},
		): Promise<ViewDto[]> =>
			viewDao.listVisible(orgId, userId, query.projectId),

		createView: async (
			orgId: string,
			userId: string,
			role: string,
			input: CreateViewInput,
		): Promise<ViewDto> => {
			const shared = input.shared ?? false;
			if (shared) {
				assertShareAllowed(role);
			}
			await assertProjectInOrg(orgId, input.projectId);
			if (!shared) {
				await assertPersonalQuota(orgId, userId);
			}
			assertLayout(input.layout);
			return viewDao.create({
				id: crypto.randomUUID(),
				orgId,
				projectId: input.projectId ?? null,
				name: input.name,
				description: input.description ?? null,
				ownerId: userId,
				shared,
				query: input.query,
				layout: input.layout,
				isDefault: input.isDefault ?? false,
			});
		},

		updateView: async (
			orgId: string,
			userId: string,
			role: string,
			viewId: string,
			input: UpdateViewInput,
		): Promise<ViewDto> => {
			const view = await requireView(orgId, viewId);
			assertCanMutate(view, userId, role);
			if (input.isDefault !== undefined && view.ownerId !== userId) {
				throw new ApiError(
					403,
					ApiErrorCode.FORBIDDEN,
					"Only the view owner can change the default view",
				);
			}
			if (input.shared !== undefined && input.shared !== view.shared) {
				if (input.shared) {
					assertShareAllowed(role);
				} else if (view.ownerId !== userId) {
					// Only the owner or an admin may hide a shared view again.
					assertShareAllowed(role);
				}
				if (!input.shared) {
					// Un-sharing turns the view personal again, so it must fit
					// the owner's personal-view quota.
					await assertPersonalQuota(orgId, view.ownerId);
				}
			}
			if (input.projectId !== undefined) {
				await assertProjectInOrg(orgId, input.projectId);
			}
			if (input.layout !== undefined) {
				assertLayout(input.layout);
			}
			const updated = await viewDao.update(orgId, view.id, view.ownerId, {
				name: input.name,
				description:
					input.description === undefined ? undefined : input.description,
				projectId: input.projectId,
				shared: input.shared,
				query: input.query,
				layout: input.layout,
				isDefault: input.isDefault,
			});
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.VIEW_NOT_FOUND,
					`View ${viewId} not found`,
				);
			}
			return updated;
		},

		setDefaultView: async (
			orgId: string,
			userId: string,
			viewId: string,
			isDefault: boolean,
		): Promise<ViewDto> => {
			const view = await requireView(orgId, viewId);
			if (view.ownerId !== userId) {
				if (!view.shared) {
					throw new ApiError(
						404,
						ApiErrorCode.VIEW_NOT_FOUND,
						`View ${viewId} not found`,
					);
				}
				throw new ApiError(
					403,
					ApiErrorCode.FORBIDDEN,
					"Only the view owner can change the default view",
				);
			}
			const updated = await viewDao.setDefault(
				orgId,
				view.id,
				view.ownerId,
				isDefault,
			);
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.VIEW_NOT_FOUND,
					`View ${viewId} not found`,
				);
			}
			return updated;
		},

		/** Removes the caller's default view (ownership enforced like setDefault). */
		clearDefaultView: async (
			orgId: string,
			userId: string,
			viewId: string,
		): Promise<void> => {
			const view = await requireView(orgId, viewId);
			if (view.ownerId !== userId) {
				if (!view.shared) {
					throw new ApiError(
						404,
						ApiErrorCode.VIEW_NOT_FOUND,
						`View ${viewId} not found`,
					);
				}
				throw new ApiError(
					403,
					ApiErrorCode.FORBIDDEN,
					"Only the view owner can change the default view",
				);
			}
			await viewDao.clearDefault(orgId, userId);
		},

		deleteView: async (
			orgId: string,
			userId: string,
			role: string,
			viewId: string,
		): Promise<void> => {
			const view = await requireView(orgId, viewId);
			assertCanMutate(view, userId, role);
			const deleted = await viewDao.delete(orgId, view.id);
			if (!deleted) {
				throw new ApiError(
					404,
					ApiErrorCode.VIEW_NOT_FOUND,
					`View ${viewId} not found`,
				);
			}
		},
	};
};

export type ViewService = ReturnType<typeof createViewService>;
