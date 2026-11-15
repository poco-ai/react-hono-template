import type {
	CreateStatusInput,
	DeleteStatusQuery,
	ReorderStatusesInput,
	UpdateStatusInput,
} from "@workspace/shared";
import type { Context } from "hono";
import type { ParamContext, StatusParams } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { StatusService } from "../services/status.service";

type Env = SessionEnv & OrgEnv;

export const createStatusController = (service: StatusService) => ({
	list: async (c: Context<Env>) =>
		ok(c, await service.listStatuses(c.get("orgMember").orgId)),

	create: async (c: Context<Env>, input: CreateStatusInput) =>
		ok(c, await service.createStatus(c.get("orgMember").orgId, input)),

	update: async (c: ParamContext<StatusParams>, input: UpdateStatusInput) =>
		ok(
			c,
			await service.updateStatus(
				c.get("orgMember").orgId,
				c.req.valid("param").statusId,
				input,
			),
		),

	reorder: async (c: Context<Env>, input: ReorderStatusesInput) =>
		ok(c, await service.reorderStatuses(c.get("orgMember").orgId, input)),

	remove: async (c: ParamContext<StatusParams>, query: DeleteStatusQuery) => {
		const orgMember = c.get("orgMember");
		return ok(
			c,
			await service.deleteStatus(
				orgMember.orgId,
				c.req.valid("param").statusId,
				orgMember.userId,
				query.migrateToStatusId,
			),
		);
	},
});
