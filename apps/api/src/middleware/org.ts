import { ApiError, ApiErrorCode } from "@workspace/shared";
import { createMiddleware } from "hono/factory";
import type { MemberDao } from "../dao/member.dao";
import type { SessionEnv } from "./auth";

export type OrgMember = {
	orgId: string;
	userId: string;
	role: string;
};

export type OrgEnv = {
	Variables: {
		orgMember: OrgMember;
	};
};

export const requireOrgMember = (memberDao: MemberDao) =>
	createMiddleware<SessionEnv & OrgEnv>(async (c, next) => {
		const orgId = c.req.param("orgId");
		const session = c.get("session");
		const membership =
			orgId && session
				? await memberDao.findByOrgAndUser(orgId, session.user.id)
				: undefined;
		if (!orgId || !membership) {
			throw new ApiError(404, ApiErrorCode.NOT_FOUND, "Organization not found");
		}
		c.set("orgMember", {
			orgId,
			userId: session.user.id,
			role: membership.role,
		});
		await next();
	});

export const requireOrgRole = (...roles: string[]) =>
	createMiddleware<OrgEnv>(async (c, next) => {
		const orgMember = c.get("orgMember");
		if (!orgMember || !roles.includes(orgMember.role)) {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"You do not have permission to perform this action",
			);
		}
		await next();
	});
