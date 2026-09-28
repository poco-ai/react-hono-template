import { count, desc, eq, or, sql } from "drizzle-orm";
import { session as sessionTable, user as userTable } from "../db/auth-schema";
import type { Database } from "../db/types";
import type {
	AdminUserDto,
	ListAdminUsersDto,
	ListAdminUsersQueryDto,
} from "../dto/admin-user.dto";

type UserRow = typeof userTable.$inferSelect;

const toDto = (row: UserRow): AdminUserDto => ({
	id: row.id,
	name: row.name,
	email: row.email,
	image: row.image,
	emailVerified: row.emailVerified,
	role: row.role,
	banned: row.banned,
	banReason: row.banReason,
	banExpires: row.banExpires ? row.banExpires.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const createAdminUserDao = (db: Database) => ({
	list: async ({
		page,
		pageSize,
		search,
	}: ListAdminUsersQueryDto): Promise<ListAdminUsersDto> => {
		const escapeLike = (value: string) =>
			value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
		const pattern = `%${escapeLike(search)}%`;
		const where = search
			? or(
					sql`${userTable.name} like ${pattern} escape '\\'`,
					sql`${userTable.email} like ${pattern} escape '\\'`,
				)
			: undefined;
		const [rows, totals] = await db.batch([
			db
				.select()
				.from(userTable)
				.where(where)
				.orderBy(desc(userTable.createdAt))
				.limit(pageSize)
				.offset((page - 1) * pageSize),
			db.select({ value: count() }).from(userTable).where(where),
		]);
		return {
			items: rows.map(toDto),
			total: totals[0]?.value ?? 0,
			page,
			pageSize,
		};
	},

	hasAdminUser: async (): Promise<boolean> => {
		const row = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.role, "admin"))
			.limit(1)
			.get();
		return row !== undefined;
	},

	findById: async (id: string): Promise<AdminUserDto | null> => {
		const row = await db
			.select()
			.from(userTable)
			.where(eq(userTable.id, id))
			.get();
		return row ? toDto(row) : null;
	},

	updateRole: async (id: string, role: string): Promise<AdminUserDto> => {
		const row = await db
			.update(userTable)
			.set({ role })
			.where(eq(userTable.id, id))
			.returning()
			.get();
		return toDto(row);
	},

	ban: async (
		id: string,
		data: { banReason: string | null; banExpires: Date | null },
	): Promise<AdminUserDto> => {
		const [rows] = await db.batch([
			db
				.update(userTable)
				.set({
					banned: true,
					banReason: data.banReason,
					banExpires: data.banExpires,
				})
				.where(eq(userTable.id, id))
				.returning(),
			db.delete(sessionTable).where(eq(sessionTable.userId, id)),
		]);
		return toDto(rows[0]);
	},

	unban: async (id: string): Promise<AdminUserDto> => {
		const row = await db
			.update(userTable)
			.set({ banned: false, banReason: null, banExpires: null })
			.where(eq(userTable.id, id))
			.returning()
			.get();
		return toDto(row);
	},
});

export type AdminUserDao = ReturnType<typeof createAdminUserDao>;
