import type { CreateIssueRelationInput } from "@workspace/shared";
import { backgroundFromContext } from "../../../core/lib/background";
import type {
	IssueParams,
	ParamContext,
	RelationParams,
} from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { RelationService } from "../services/relation.service";

export const createRelationController = (service: RelationService) => ({
	list: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.listRelations(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
			),
		);
	},

	create: async (
		c: ParamContext<IssueParams>,
		input: CreateIssueRelationInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.createRelation(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		);
	},

	remove: async (c: ParamContext<RelationParams>) => {
		const params = c.req.valid("param");
		await service.deleteRelation(
			c.get("orgMember").orgId,
			params.projectId,
			params.number,
			c.get("session").user.id,
			params.relationId,
			backgroundFromContext(c),
		);
		return ok(c, { deleted: true });
	},
});
