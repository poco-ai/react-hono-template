import type { UpdateIssueSubscriptionInput } from "@workspace/shared";
import type { IssueParams, ParamContext } from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { IssueSubscriptionService } from "../services/issue-subscription.service";

export const createIssueSubscriptionController = (
	service: IssueSubscriptionService,
) => ({
	get: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.getSubscription(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
			),
		);
	},

	update: async (
		c: ParamContext<IssueParams>,
		input: UpdateIssueSubscriptionInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.updateSubscription(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				input,
			),
		);
	},
});
