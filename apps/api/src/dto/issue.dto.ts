import type { issues } from "../db/schema";

type IssueRow = typeof issues.$inferSelect;

export type IssueDto = Omit<
	IssueRow,
	"createdAt" | "updatedAt" | "dueDate" | "deletedAt"
> & {
	createdAt: string;
	updatedAt: string;
	dueDate: string | null;
	deletedAt: string | null;
};

export type IssueDetailDto = IssueDto & {
	labelIds: string[];
};

export type ListIssuesQueryDto = {
	page: number;
	pageSize: number;
	status?: string[];
	priority?: number[];
	assigneeId?: string;
	labelId?: string;
	search?: string;
	sort: "updated" | "created" | "priority";
	projectId?: string;
};

export type ListIssuesDto = {
	items: IssueDetailDto[];
	total: number;
	page: number;
	pageSize: number;
};
