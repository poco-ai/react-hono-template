import type {
	CreateViewInput,
	UpdateViewInput,
	ViewListQuery,
} from "@workspace/shared";
import type { Context } from "hono";
import { requireParam } from "../lib/params";
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

	update: async (c: Context<Env>, input: UpdateViewInput) =>
		ok(
			c,
			await service.updateView(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				c.get("orgMember").role,
				requireParam(c, "viewId"),
				input,
			),
		),

	setDefault: async (c: Context<Env>, isDefault: boolean) =>
		ok(
			c,
			await service.setDefaultView(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				requireParam(c, "viewId"),
				isDefault,
			),
		),

	clearDefault: async (c: Context<Env>) => {
		await service.clearDefaultView(
			c.get("orgMember").orgId,
			c.get("session").user.id,
			requireParam(c, "viewId"),
		);
		return ok(c, { cleared: true });
	},

	remove: async (c: Context<Env>) => {
		await service.deleteView(
			c.get("orgMember").orgId,
			c.get("session").user.id,
			c.get("orgMember").role,
			requireParam(c, "viewId"),
		);
		return ok(c, { deleted: true });
	},
});
