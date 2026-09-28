import { and, eq } from "drizzle-orm";
import { member } from "../db/auth-schema";
import type { Database } from "../db/types";

export const createMemberDao = (db: Database) => ({
	findByOrgAndUser: (orgId: string, userId: string) =>
		db
			.select()
			.from(member)
			.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
			.get(),
});

export type MemberDao = ReturnType<typeof createMemberDao>;
