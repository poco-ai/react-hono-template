import type { issueStatuses } from "../db/schema";

type StatusRow = typeof issueStatuses.$inferSelect;

export type StatusDto = Omit<StatusRow, "createdAt" | "updatedAt"> & {
	createdAt: string;
	updatedAt: string;
};
