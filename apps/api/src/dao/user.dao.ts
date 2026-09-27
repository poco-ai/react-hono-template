import { eq } from "drizzle-orm";
import { usersTable } from "../db/schema";
import type { Database } from "../db/types";

export const createUserDao = (db: Database) => ({
	list: () => db.select().from(usersTable).all(),
	findById: (id: number) =>
		db.select().from(usersTable).where(eq(usersTable.id, id)).get(),
});

export type UserDao = ReturnType<typeof createUserDao>;
