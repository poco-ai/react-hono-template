import { count, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { organization, user as userTable } from "../db/auth-schema";
import { issues, subscriptions } from "../db/schema";
import type { Database } from "../db/types";
import type {
	AdminOrgDto,
	AdminStatsDto,
	ListAdminOrgsDto,
} from "../dto/admin-org.dto";

type OrganizationRow = typeof organization.$inferSelect;

const toOrgDto = (row: OrganizationRow): AdminOrgDto => ({
	id: row.id,
	name: row.name,
	slug: row.slug,
	frozen: row.frozen,
	createdAt: row.createdAt.toISOString(),
	plan: "free",
	status: null,
	members: 0,
	issues: 0,
});

export const createOrganizationDao = (db: Database) => ({
	findById: async (orgId: string): Promise<AdminOrgDto | null> => {
		const row = await db
			.select()
			.from(organization)
			.where(eq(organization.id, orgId))
			.get();
		return row ? toOrgDto(row) : null;
	},

	list: async ({
		page,
		pageSize,
		search,
	}: {
		page: number;
		pageSize: number;
		search: string;
	}): Promise<ListAdminOrgsDto> => {
		const escapeLike = (value: string) =>
			value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
		const where: SQL | undefined = search
			? or(
					sql`${organization.name} like ${`%${escapeLike(search)}%`} escape '\\'`,
					sql`${organization.slug} like ${`%${escapeLike(search)}%`} escape '\\'`,
				)
			: undefined;
		const [rows, totals] = await db.batch([
			db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					frozen: organization.frozen,
					createdAt: organization.createdAt,
					plan: subscriptions.plan,
					status: subscriptions.status,
					members: sql<number>`(select count(*) from member where member.organization_id = ${organization.id})`,
					issues: sql<number>`(select count(*) from issues where issues.org_id = ${organization.id})`,
				})
				.from(organization)
				.leftJoin(subscriptions, eq(subscriptions.orgId, organization.id))
				.where(where)
				.orderBy(desc(organization.createdAt))
				.limit(pageSize)
				.offset((page - 1) * pageSize),
			db.select({ value: count() }).from(organization).where(where),
		]);
		return {
			items: rows.map((row) => ({
				id: row.id,
				name: row.name,
				slug: row.slug,
				frozen: row.frozen,
				createdAt: row.createdAt.toISOString(),
				plan: row.plan === "pro" ? "pro" : "free",
				status: row.status ?? null,
				members: row.members ?? 0,
				issues: row.issues ?? 0,
			})),
			total: totals[0]?.value ?? 0,
			page,
			pageSize,
		};
	},

	updateFrozen: async (orgId: string, frozen: boolean) => {
		const row = await db
			.update(organization)
			.set({ frozen })
			.where(eq(organization.id, orgId))
			.returning({ id: organization.id, frozen: organization.frozen })
			.get();
		return row ?? null;
	},

	getStats: async (): Promise<AdminStatsDto> => {
		const [users, orgs, issueRows, proOrgs] = await db.batch([
			db.select({ value: count() }).from(userTable),
			db.select({ value: count() }).from(organization),
			db.select({ value: count() }).from(issues),
			db
				.select({ value: count() })
				.from(subscriptions)
				.where(eq(subscriptions.plan, "pro")),
		]);
		return {
			users: users[0]?.value ?? 0,
			orgs: orgs[0]?.value ?? 0,
			issues: issueRows[0]?.value ?? 0,
			proOrgs: proOrgs[0]?.value ?? 0,
		};
	},
});

export type OrganizationDao = ReturnType<typeof createOrganizationDao>;
