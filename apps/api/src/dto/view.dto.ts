import type { IssueQuery } from "@workspace/shared";
import type { views } from "../db/schema";

type ViewRow = typeof views.$inferSelect;

/**
 * Saved issue view. `query` is the validated structured query tree; grouping
 * and layout are presentation hints echoed back to the client.
 */
export type ViewDto = Omit<ViewRow, "createdAt" | "updatedAt"> & {
	createdAt: string;
	updatedAt: string;
	query: IssueQuery;
};
