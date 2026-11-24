import { ApiError, ApiErrorCode } from "@workspace/shared";
import { createMiddleware } from "hono/factory";
import type { MemberDao } from "../dao/member.dao";
import type { SessionEnv } from "./auth";

export type OrgMember = {
	orgId: string;
	userId: string;
	role: string;
	frozen: boolean;
};

export type OrgEnv = {
	Variables: {
		orgMember: OrgMember;
	};
};

export const requireOrgMember = (
	memberDao: MemberDao,
	{
		/** Route suffixes after `/api/orgs/:orgId` whose writes bypass the freeze guard. */
		freezeWriteExempt = [],
	}: { freezeWriteExempt?: readonly string[] } = {},
) =>
	createMiddleware<SessionEnv & OrgEnv>(async (c, next) => {
		const orgId = c.req.param("orgId");
		const session = c.get("session");
		const membership =
			orgId && session
				? await memberDao.findByOrgAndUser(orgId, session.user.id)
				: undefined;
		if (!orgId || !membership) {
			throw new ApiError(ApiErrorCode.NOT_FOUND, "Organization not found");
		}
		if (membership.frozen) {
			const method = c.req.method.toUpperCase();
			const suffix = c.req.path.slice(`/api/orgs/${orgId}`.length);
			const exempt = freezeWriteExempt.some(
				(prefix) => suffix === prefix || suffix.startsWith(`${prefix}/`),
			);
			if (method !== "GET" && method !== "HEAD" && !exempt) {
				throw new ApiError(ApiErrorCode.ORG_FROZEN, "Organization is frozen");
			}
		}
		c.set("orgMember", {
			orgId,
			userId: session.user.id,
			role: membership.role,
			frozen: membership.frozen,
		});
		await next();
	});

export const requireOrgRole = (...roles: string[]) =>
	createMiddleware<OrgEnv>(async (c, next) => {
		const orgMember = c.get("orgMember");
		if (!orgMember || !roles.includes(orgMember.role)) {
			throw new ApiError(
				ApiErrorCode.FORBIDDEN,
				"You do not have permission to perform this action",
			);
		}
		await next();
	});
