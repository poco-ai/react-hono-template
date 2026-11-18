import type {
	AdjustCreditsInput,
	UpdateQuotaPolicyInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { QuotaService } from "../services/quota.service";

const orgIdOf = (c: Context) => {
	const orgId = c.req.param("orgId");
	if (!orgId) {
		throw new Error("Missing orgId");
	}
	return orgId;
};

export const createQuotaController = (service: QuotaService) => ({
	overview: async (c: Context<SessionEnv>) =>
		ok(c, await service.overview(orgIdOf(c))),

	adjustCredits: async (c: Context<SessionEnv>, input: AdjustCreditsInput) => {
		const orgId = orgIdOf(c);
		const balance = await service.adjustCredits({
			orgId,
			amount: input.amount,
			reason: input.reason,
			idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
			actor: { actorType: "user", actorId: c.get("session").user.id },
		});
		return ok(c, balance ?? { balance: 0, reserved: 0 });
	},

	setPolicy: async (c: Context<SessionEnv>, input: UpdateQuotaPolicyInput) => {
		await service.setPolicy({
			orgId: orgIdOf(c),
			meter: input.meter,
			policy: {
				mode: input.mode,
				included: input.included,
				creditRate: input.creditRate,
			},
			actor: { actorType: "user", actorId: c.get("session").user.id },
		});
		return ok(c, { updated: true });
	},
});
