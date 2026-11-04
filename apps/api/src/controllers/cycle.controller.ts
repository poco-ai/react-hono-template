import type {
	CreateCycleInput,
	CycleListQuery,
	RolloverCycleInput,
	UpdateCycleInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { requireCycleId, requireProjectId } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { CycleService } from "../services/cycle.service";

type Env = SessionEnv & OrgEnv;

export const createCycleController = (service: CycleService) => ({
	list: async (c: Context<Env>, query: CycleListQuery) =>
		ok(
			c,
			await service.listCycles(
				c.get("orgMember").orgId,
				requireProjectId(c),
				query,
			),
		),

	get: async (c: Context<Env>) =>
		ok(
			c,
			await service.getCycle(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireCycleId(c),
			),
		),

	create: async (c: Context<Env>, input: CreateCycleInput) =>
		ok(
			c,
			await service.createCycle(
				c.get("orgMember").orgId,
				requireProjectId(c),
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: Context<Env>, input: UpdateCycleInput) =>
		ok(
			c,
			await service.updateCycle(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireCycleId(c),
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteCycle(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireCycleId(c),
			c.get("session").user.id,
		);
		return ok(c, { deleted: true });
	},

	rollover: async (c: Context<Env>, input: RolloverCycleInput) =>
		ok(
			c,
			await service.rolloverCycle(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireCycleId(c),
				c.get("session").user.id,
				input,
			),
		),
});
