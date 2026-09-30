import type { CreateProjectInput, UpdateProjectInput } from "@workspace/shared";
import type { Context } from "hono";
import { requireProjectId } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ProjectService } from "../services/project.service";

type Env = SessionEnv & OrgEnv;

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
