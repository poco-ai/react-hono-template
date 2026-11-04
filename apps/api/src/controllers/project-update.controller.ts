import type {
	CreateProjectUpdateInput,
	ProjectUpdateListQuery,
	UpdateProjectUpdateInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { requireProjectId, requireUpdateId } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ProjectUpdateService } from "../services/project-update.service";

type Env = SessionEnv & OrgEnv;

export const createProjectUpdateController = (
	service: ProjectUpdateService,
) => ({
	list: async (c: Context<Env>, query: ProjectUpdateListQuery) =>
		ok(
			c,
			await service.listUpdates(
				c.get("orgMember").orgId,
				requireProjectId(c),
				query,
			),
		),

	create: async (c: Context<Env>, input: CreateProjectUpdateInput) =>
		ok(
			c,
			await service.createUpdate(
				c.get("orgMember").orgId,
				requireProjectId(c),
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: Context<Env>, input: UpdateProjectUpdateInput) =>
		ok(
			c,
			await service.updateUpdate(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireUpdateId(c),
				{
					userId: c.get("orgMember").userId,
					role: c.get("orgMember").role,
				},
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteUpdate(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireUpdateId(c),
			{
				userId: c.get("orgMember").userId,
				role: c.get("orgMember").role,
			},
		);
		return ok(c, { deleted: true });
	},
});
