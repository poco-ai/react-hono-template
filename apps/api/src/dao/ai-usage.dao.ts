import { and, eq, gte, lte, sql } from "drizzle-orm";
import { aiUsageDaily } from "../db/schema";
import type { Database } from "../db/types";

export type AiUsageIncrement = {
	orgId: string;
	userId: string;
	day: string;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	toolCalls: number;
};

export type AiUsageTotals = {
	requests: number;
	inputTokens: number;
	outputTokens: number;
	toolCalls: number;
};

export const createAiUsageDao = (db: Database) => ({
	/** Adds to (or creates) the daily bucket for the user. */
	record: async (data: AiUsageIncrement): Promise<void> => {
		await db
			.insert(aiUsageDaily)
			.values(data)
			.onConflictDoUpdate({
				target: [aiUsageDaily.orgId, aiUsageDaily.userId, aiUsageDaily.day],
				set: {
					requests: sql`${aiUsageDaily.requests} + ${data.requests}`,
					inputTokens: sql`${aiUsageDaily.inputTokens} + ${data.inputTokens}`,
					outputTokens: sql`${aiUsageDaily.outputTokens} + ${data.outputTokens}`,
					toolCalls: sql`${aiUsageDaily.toolCalls} + ${data.toolCalls}`,
				},
			});
	},

	sumBetween: async (
		orgId: string,
		fromDay: string,
		toDay: string,
	): Promise<AiUsageTotals> => {
		const row = await db
			.select({
				requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)`,
				inputTokens: sql<number>`coalesce(sum(${aiUsageDaily.inputTokens}), 0)`,
				outputTokens: sql<number>`coalesce(sum(${aiUsageDaily.outputTokens}), 0)`,
				toolCalls: sql<number>`coalesce(sum(${aiUsageDaily.toolCalls}), 0)`,
			})
			.from(aiUsageDaily)
			.where(
				and(
					eq(aiUsageDaily.orgId, orgId),
					gte(aiUsageDaily.day, fromDay),
					lte(aiUsageDaily.day, toDay),
				),
			)
			.get();
		return (
			row ?? {
				requests: 0,
				inputTokens: 0,
				outputTokens: 0,
				toolCalls: 0,
			}
		);
	},
});

export type AiUsageDao = ReturnType<typeof createAiUsageDao>;
