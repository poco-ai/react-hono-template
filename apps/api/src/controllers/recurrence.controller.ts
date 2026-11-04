import type {
	CreateRecurrenceInput,
	UpdateRecurrenceInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { requireProjectId, requireRecurrenceId } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { RecurrenceService } from "../services/recurrence.service";

type Env = SessionEnv & OrgEnv;

export const createRecurrenceController = (service: RecurrenceService) => ({
	list: async (c: Context<Env>) =>
		ok(
			c,
			await service.listRecurrences(
				c.get("orgMember").orgId,
				requireProjectId(c),
			),
		),

	create: async (c: Context<Env>, input: CreateRecurrenceInput) =>
		ok(
			c,
			await service.createRecurrence(
				c.get("orgMember").orgId,
				requireProjectId(c),
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: Context<Env>, input: UpdateRecurrenceInput) =>
		ok(
			c,
			await service.updateRecurrence(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireRecurrenceId(c),
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteRecurrence(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireRecurrenceId(c),
		);
		return ok(c, { deleted: true });
	},
});
