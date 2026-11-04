import type { Paginated } from "@workspace/shared";
import type { issues } from "../db/schema";
import type { StatusDto } from "./status.dto";

type IssueRow = typeof issues.$inferSelect;

export type IssueDto = Omit<
	IssueRow,
	"createdAt" | "updatedAt" | "dueDate" | "deletedAt"
> & {
	createdAt: string;
	updatedAt: string;
	dueDate: string | null;
	deletedAt: string | null;
	/** Resolved workflow status (id/name/category/color/position). */
	status: StatusDto;
};

export type IssueDetailDto = IssueDto & {
	labelIds: string[];
};

export type IssueNavigationDto = {
	prevNumber: number | null;
	nextNumber: number | null;
};

export type ListIssuesQueryDto = {
	page: number;
	pageSize: number;
	statusId?: string[];
	priority?: number[];
	assigneeId?: string;
	labelId?: string;
	search?: string;
	sort: "updated" | "created" | "priority";
	projectId?: string;
};

export type ListIssuesDto = Paginated<IssueDetailDto>;
