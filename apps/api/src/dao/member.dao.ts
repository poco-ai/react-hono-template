import { and, count, eq } from "drizzle-orm";
import { member, organization, user } from "../db/auth-schema";
import { subscriptions } from "../db/schema";
import type { Database } from "../db/types";

export type MemberWithOrg = {
	id: string;
	organizationId: string;
	userId: string;
	role: string;
	createdAt: Date;
	updatedAt: Date;
	frozen: boolean;
};

export const createMemberDao = (db: Database) => ({
	findByOrgAndUser: async (
		orgId: string,
		userId: string,
	): Promise<MemberWithOrg | undefined> => {
		const row = await db
			.select({ member, frozen: organization.frozen })
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
			.get();
		return row ? { ...row.member, frozen: row.frozen } : undefined;
	},

	countByOrg: async (orgId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, orgId));
		return row?.value ?? 0;
	},

	countByUser: async (userId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(member)
			.where(eq(member.userId, userId));
		return row?.value ?? 0;
	},

	listOrgPlansByUser: async (userId: string): Promise<string[]> => {
		const rows = await db
			.select({ plan: subscriptions.plan })
			.from(member)
			.leftJoin(subscriptions, eq(member.organizationId, subscriptions.orgId))
			.where(eq(member.userId, userId));
		return rows.map((row) => row.plan ?? "free");
	},

	findOwnerEmail: async (orgId: string): Promise<string | null> => {
		const row = await db
			.select({ email: user.email })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(eq(member.organizationId, orgId), eq(member.role, "owner")))
			.get();
		return row?.email ?? null;
	},
});

export type MemberDao = ReturnType<typeof createMemberDao>;
