import type { projects } from "../db/schema";

type ProjectRow = typeof projects.$inferSelect;

export type ProjectDto = Omit<ProjectRow, "createdAt" | "updatedAt"> & {
	createdAt: string;
	updatedAt: string;
};

export type ProjectIssueStats = {
	openIssueCount: number;
	totalIssueCount: number;
};

export type ProjectWithStatsDto = ProjectDto & ProjectIssueStats;
