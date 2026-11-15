import type {
	CreateViewInput,
	UpdateViewInput,
	ViewListQuery,
} from "@workspace/shared";
import type { Context } from "hono";
import type { ParamContext, ViewParams } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ViewService } from "../services/view.service";

type Env = SessionEnv & OrgEnv;

export const createViewController = (service: ViewService) => ({
	list: async (c: Context<Env>, query: ViewListQuery) =>
		ok(
			c,
			await service.listViews(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				query,
			),
		),

	create: async (c: Context<Env>, input: CreateViewInput) =>
		ok(
			c,
			await service.createView(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				c.get("orgMember").role,
				input,
			),
		),

	update: async (c: ParamContext<ViewParams>, input: UpdateViewInput) =>
		ok(
			c,
			await service.updateView(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				c.get("orgMember").role,
				c.req.valid("param").viewId,
				input,
			),
		),

	setDefault: async (c: ParamContext<ViewParams>, isDefault: boolean) =>
		ok(
			c,
			await service.setDefaultView(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				c.req.valid("param").viewId,
				isDefault,
			),
		),

	clearDefault: async (c: ParamContext<ViewParams>) => {
		await service.clearDefaultView(
			c.get("orgMember").orgId,
			c.get("session").user.id,
			c.req.valid("param").viewId,
		);
		return ok(c, { cleared: true });
	},

	remove: async (c: ParamContext<ViewParams>) => {
		await service.deleteView(
			c.get("orgMember").orgId,
			c.get("session").user.id,
			c.get("orgMember").role,
			c.req.valid("param").viewId,
		);
		return ok(c, { deleted: true });
	},
});
