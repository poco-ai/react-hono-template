import { TERMINAL_STATUS_CATEGORIES } from "@workspace/shared";
import { inArray, sql } from "drizzle-orm";
import { issueStatuses } from "../db/schema";

/** Requires the query to join `issue_statuses` on the issue's status id. */
export const terminalIssueCountSql = () =>
	sql<number>`sum(case when ${inArray(issueStatuses.category, [...TERMINAL_STATUS_CATEGORIES])} then 1 else 0 end)`;

/** Companion of `terminalIssueCountSql` for the same joined query. */
export const openIssueCountSql = () =>
	sql<number>`sum(case when ${inArray(issueStatuses.category, [...TERMINAL_STATUS_CATEGORIES])} then 0 else 1 end)`;
