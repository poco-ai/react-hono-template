import type {
	CreateCycleInput,
	CycleListQuery,
	RolloverCycleInput,
	UpdateCycleInput,
} from "@workspace/shared";
import type { CycleParams, ParamContext, ProjectParams } from "../lib/params";
import { ok } from "../lib/response";
import type { CycleService } from "../services/cycle.service";

export const createCycleController = (service: CycleService) => ({
	list: async (c: ParamContext<ProjectParams>, query: CycleListQuery) =>
		ok(
			c,
			await service.listCycles(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				query,
			),
		),

	get: async (c: ParamContext<CycleParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.getCycle(
				c.get("orgMember").orgId,
				params.projectId,
				params.cycleId,
			),
		);
	},

	create: async (c: ParamContext<ProjectParams>, input: CreateCycleInput) =>
		ok(
			c,
			await service.createCycle(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: ParamContext<CycleParams>, input: UpdateCycleInput) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.updateCycle(
				c.get("orgMember").orgId,
				params.projectId,
				params.cycleId,
				input,
			),
		);
	},

	remove: async (c: ParamContext<CycleParams>) => {
		const params = c.req.valid("param");
		await service.deleteCycle(
			c.get("orgMember").orgId,
			params.projectId,
			params.cycleId,
			c.get("session").user.id,
		);
		return ok(c, { deleted: true });
	},

	rollover: async (c: ParamContext<CycleParams>, input: RolloverCycleInput) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.rolloverCycle(
				c.get("orgMember").orgId,
				params.projectId,
				params.cycleId,
				c.get("session").user.id,
				input,
			),
		);
	},
});
