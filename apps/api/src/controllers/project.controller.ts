import {
	ApiError,
	ApiErrorCode,
	type CreateProjectInput,
	type UpdateProjectInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ProjectService } from "../services/project.service";

type Env = SessionEnv & OrgEnv;

const requireProjectId = (c: Context<Env>) => {
	const projectId = c.req.param("projectId");
	if (!projectId) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required param: projectId",
		);
	}
	return projectId;
};

export const createProjectController = (service: ProjectService) => ({
	list: async (c: Context<Env>) =>
		ok(c, await service.listProjects(c.get("orgMember").orgId)),

	get: async (c: Context<Env>) =>
		ok(
			c,
			await service.getProject(c.get("orgMember").orgId, requireProjectId(c)),
		),

	create: async (c: Context<Env>, input: CreateProjectInput) =>
		ok(c, await service.createProject(c.get("orgMember").orgId, input)),

	update: async (c: Context<Env>, input: UpdateProjectInput) =>
		ok(
			c,
			await service.updateProject(
				c.get("orgMember").orgId,
				requireProjectId(c),
				input,
			),
		),
});

export type ProjectController = ReturnType<typeof createProjectController>;
