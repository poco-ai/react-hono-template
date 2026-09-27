import type { usersTable } from "../db/schema";

export type UserDto = typeof usersTable.$inferSelect;
