import type {
	CreateRecurrenceInput,
	UpdateRecurrenceInput,
} from "@workspace/shared";
import type {
	ParamContext,
	ProjectParams,
	RecurrenceParams,
} from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { RecurrenceService } from "../services/recurrence.service";

export const createRecurrenceController = (service: RecurrenceService) => ({
	list: async (c: ParamContext<ProjectParams>) =>
		ok(
			c,
			await service.listRecurrences(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
			),
		),

	create: async (
		c: ParamContext<ProjectParams>,
		input: CreateRecurrenceInput,
	) =>
		ok(
			c,
			await service.createRecurrence(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				c.get("session").user.id,
				input,
			),
		),

	update: async (
		c: ParamContext<RecurrenceParams>,
		input: UpdateRecurrenceInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.updateRecurrence(
				c.get("orgMember").orgId,
				params.projectId,
				params.recurrenceId,
				input,
			),
		);
	},

	remove: async (c: ParamContext<RecurrenceParams>) => {
		const params = c.req.valid("param");
		await service.deleteRecurrence(
			c.get("orgMember").orgId,
			params.projectId,
			params.recurrenceId,
		);
		return ok(c, { deleted: true });
	},
});
