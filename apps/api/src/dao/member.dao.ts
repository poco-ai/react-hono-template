import { and, asc, count, eq, isNotNull, lt } from "drizzle-orm";
import { invitation, member, organization, user } from "../db/auth-schema";
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

export type MemberOrgSummary = {
	id: string;
	name: string;
	slug: string;
	frozen: boolean;
	role: string;
};

export type MemberDirectoryEntry = {
	userId: string;
	name: string;
	email: string;
	image: string | null;
	role: string;
	createdAt: Date;
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

	isOrgFrozen: async (orgId: string): Promise<boolean> => {
		const row = await db
			.select({ frozen: organization.frozen })
			.from(organization)
			.where(eq(organization.id, orgId))
			.get();
		return row?.frozen ?? false;
	},

	listMembershipsByUser: async (
		userId: string,
	): Promise<MemberOrgSummary[]> => {
		const rows = await db
			.select({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				frozen: organization.frozen,
				role: member.role,
			})
			.from(member)
			.innerJoin(organization, eq(organization.id, member.organizationId))
			.where(eq(member.userId, userId))
			.orderBy(asc(organization.name), asc(organization.id))
			.all();
		return rows;
	},

	listByOrg: async (orgId: string): Promise<MemberDirectoryEntry[]> => {
		const rows = await db
			.select({
				userId: member.userId,
				name: user.name,
				email: user.email,
				image: user.image,
				role: member.role,
				createdAt: member.createdAt,
			})
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(member.organizationId, orgId))
			.orderBy(asc(user.name), asc(member.userId))
			.all();
		return rows;
	},

	countByOrg: async (orgId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, orgId));
		return row?.value ?? 0;
	},

	countPendingInvitationsByOrg: async (orgId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, orgId),
					eq(invitation.status, "pending"),
				),
			);
		return row?.value ?? 0;
	},

	deleteExpiredPending: async (now: Date): Promise<number> => {
		const rows = await db
			.delete(invitation)
			.where(
				and(
					eq(invitation.status, "pending"),
					isNotNull(invitation.expiresAt),
					lt(invitation.expiresAt, now),
				),
			)
			.returning({ id: invitation.id });
		return rows.length;
	},

	findInvitationOrgId: async (invitationId: string): Promise<string | null> => {
		const row = await db
			.select({ organizationId: invitation.organizationId })
			.from(invitation)
			.where(eq(invitation.id, invitationId))
			.get();
		return row?.organizationId ?? null;
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
