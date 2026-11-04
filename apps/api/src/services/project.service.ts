import {
	ApiError,
	ApiErrorCode,
	type CreateProjectInput,
	PLANS,
	type UpdateProjectInput,
} from "@workspace/shared";
import type { MemberDao } from "../dao/member.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { ProjectDto, ProjectWithStatsDto } from "../dto/project.dto";
import type { PlanService } from "./plan.service";

export const createProjectService = (
	dao: ProjectDao,
	plans: PlanService,
	memberDao: Pick<MemberDao, "findByOrgAndUser">,
) => ({
	listProjects: async (
		orgId: string,
		options?: { includeArchived?: boolean },
	): Promise<ProjectWithStatsDto[]> => {
		const [projects, counts] = await Promise.all([
			dao.listByOrg(orgId, options),
			dao.listIssueCountsByOrg(orgId),
		]);
		return projects.map((project) => ({
			...project,
			openIssueCount: counts.get(project.id)?.openIssueCount ?? 0,
			totalIssueCount: counts.get(project.id)?.totalIssueCount ?? 0,
		}));
	},

	getProject: async (orgId: string, projectId: string): Promise<ProjectDto> => {
		const project = await dao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		return project;
	},

	createProject: async (
		orgId: string,
		input: CreateProjectInput,
	): Promise<ProjectDto> => {
		const plan = await plans.getPlanForOrg(orgId);
		plans.assertWithinLimit(
			"projects",
			await dao.countByOrg(orgId),
			PLANS[plan].projects,
			plan,
		);
		const existing = await dao.findByKey(orgId, input.key);
		if (existing) {
			throw new ApiError(
				409,
				ApiErrorCode.PROJECT_KEY_TAKEN,
				`Project key "${input.key}" is already used in this organization`,
			);
		}
		try {
			return await dao.create({
				id: crypto.randomUUID(),
				orgId,
				name: input.name,
				key: input.key,
				description: input.description ?? null,
				color: input.color ?? null,
			});
		} catch (err) {
			if (err instanceof Error && /unique constraint/i.test(err.message)) {
				throw new ApiError(
					409,
					ApiErrorCode.PROJECT_KEY_TAKEN,
					`Project key "${input.key}" is already used in this organization`,
				);
			}
			throw err;
		}
	},

	updateProject: async (
		orgId: string,
		projectId: string,
		input: UpdateProjectInput,
	): Promise<ProjectDto> => {
		const project = await dao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		if (input.key && input.key !== project.key) {
			const existing = await dao.findByKey(orgId, input.key);
			if (existing && existing.id !== project.id) {
				throw new ApiError(
					409,
					ApiErrorCode.PROJECT_KEY_TAKEN,
					`Project key "${input.key}" is already used in this organization`,
				);
			}
		}
		if (input.leadId) {
			const member = await memberDao.findByOrgAndUser(orgId, input.leadId);
			if (!member) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Project lead must be a member of this organization",
				);
			}
		}
		try {
			const updated = await dao.update(orgId, projectId, {
				name: input.name,
				key: input.key,
				description: "description" in input ? input.description : undefined,
				color: "color" in input ? input.color : undefined,
				archived: input.archived,
				health: "health" in input ? (input.health ?? null) : undefined,
				targetDate:
					"targetDate" in input
						? input.targetDate
							? new Date(input.targetDate)
							: null
						: undefined,
				leadId: "leadId" in input ? (input.leadId ?? null) : undefined,
			});
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.PROJECT_NOT_FOUND,
					`Project ${projectId} not found`,
				);
			}
			return updated;
		} catch (err) {
			if (err instanceof Error && /unique constraint/i.test(err.message)) {
				throw new ApiError(
					409,
					ApiErrorCode.PROJECT_KEY_TAKEN,
					`Project key "${input.key}" is already used in this organization`,
				);
			}
			throw err;
		}
	},
});

export type ProjectService = ReturnType<typeof createProjectService>;
