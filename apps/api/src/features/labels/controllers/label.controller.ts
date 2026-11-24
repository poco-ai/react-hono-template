import type { CreateLabelInput, UpdateLabelInput } from "@workspace/shared";
import type { Context } from "hono";
import type { LabelParams, ParamContext } from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import type { LabelService } from "../services/label.service";

type Env = SessionEnv & OrgEnv;

export const createLabelController = (service: LabelService) => ({
	list: async (c: Context<Env>) =>
		ok(c, await service.listLabels(c.get("orgMember").orgId)),

	create: async (c: Context<Env>, input: CreateLabelInput) =>
		ok(c, await service.createLabel(c.get("orgMember").orgId, input)),

	update: async (c: ParamContext<LabelParams>, input: UpdateLabelInput) =>
		ok(
			c,
			await service.updateLabel(
				c.get("orgMember").orgId,
				c.req.valid("param").labelId,
				input,
			),
		),

	remove: async (c: ParamContext<LabelParams>) => {
		await service.deleteLabel(
			c.get("orgMember").orgId,
			c.req.valid("param").labelId,
		);
		return ok(c, { deleted: true });
	},
});
