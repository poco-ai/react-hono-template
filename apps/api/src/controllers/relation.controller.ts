import type { CreateIssueRelationInput } from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../lib/background";
import {
	requireIssueNumber,
	requireParam,
	requireProjectId,
} from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { RelationService } from "../services/relation.service";

type Env = SessionEnv & OrgEnv;

export const createRelationController = (service: RelationService) => ({
	list: async (c: Context<Env>) =>
		ok(
			c,
			await service.listRelations(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
			),
		),

	create: async (c: Context<Env>, input: CreateIssueRelationInput) =>
		ok(
			c,
			await service.createRelation(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteRelation(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireIssueNumber(c),
			c.get("session").user.id,
			requireParam(c, "relationId"),
			backgroundFromContext(c),
		);
		return ok(c, { deleted: true });
	},
});
