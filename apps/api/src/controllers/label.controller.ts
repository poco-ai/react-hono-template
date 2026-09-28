import {
	ApiError,
	ApiErrorCode,
	type CreateLabelInput,
	type UpdateLabelInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { LabelService } from "../services/label.service";

type Env = SessionEnv & OrgEnv;

const requireLabelId = (c: Context<Env>) => {
	const labelId = c.req.param("labelId");
	if (!labelId) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required param: labelId",
		);
	}
	return labelId;
};

export const createLabelController = (service: LabelService) => ({
	list: async (c: Context<Env>) =>
		ok(c, await service.listLabels(c.get("orgMember").orgId)),

	create: async (c: Context<Env>, input: CreateLabelInput) =>
		ok(c, await service.createLabel(c.get("orgMember").orgId, input)),

	update: async (c: Context<Env>, input: UpdateLabelInput) =>
		ok(
			c,
			await service.updateLabel(
				c.get("orgMember").orgId,
				requireLabelId(c),
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteLabel(c.get("orgMember").orgId, requireLabelId(c));
		return ok(c, { deleted: true });
	},
});

export type LabelController = ReturnType<typeof createLabelController>;
