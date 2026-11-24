import type {
	CreateProjectUpdateInput,
	ProjectUpdateListQuery,
	UpdateProjectUpdateInput,
} from "@workspace/shared";
import type {
	ParamContext,
	ProjectParams,
	ProjectUpdateParams,
} from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { ProjectUpdateService } from "../services/project-update.service";

export const createProjectUpdateController = (
	service: ProjectUpdateService,
) => ({
	list: async (c: ParamContext<ProjectParams>, query: ProjectUpdateListQuery) =>
		ok(
			c,
			await service.listUpdates(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				query,
			),
		),

	create: async (
		c: ParamContext<ProjectParams>,
		input: CreateProjectUpdateInput,
	) =>
		ok(
			c,
			await service.createUpdate(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				c.get("session").user.id,
				input,
			),
		),

	update: async (
		c: ParamContext<ProjectUpdateParams>,
		input: UpdateProjectUpdateInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.updateUpdate(
				c.get("orgMember").orgId,
				params.projectId,
				params.updateId,
				{
					userId: c.get("orgMember").userId,
					role: c.get("orgMember").role,
				},
				input,
			),
		);
	},

	remove: async (c: ParamContext<ProjectUpdateParams>) => {
		const params = c.req.valid("param");
		await service.deleteUpdate(
			c.get("orgMember").orgId,
			params.projectId,
			params.updateId,
			{
				userId: c.get("orgMember").userId,
				role: c.get("orgMember").role,
			},
		);
		return ok(c, { deleted: true });
	},
});
