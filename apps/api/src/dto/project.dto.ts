import type { projects } from "../db/schema";

type ProjectRow = typeof projects.$inferSelect;

export type ProjectDto = Omit<
	ProjectRow,
	"createdAt" | "updatedAt" | "targetDate"
> & {
	createdAt: string;
	updatedAt: string;
	targetDate: string | null;
};

export type ProjectIssueStats = {
	openIssueCount: number;
	totalIssueCount: number;
};

export type ProjectWithStatsDto = ProjectDto & ProjectIssueStats;
