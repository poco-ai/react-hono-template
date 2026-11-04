import type {
	IssueFilterNode,
	IssueQuerySort,
	Paginated,
} from "@workspace/shared";
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

/** Compact issue projection used by hierarchy/relation summaries. */
export type IssueLinkSummaryDto = Pick<
	IssueDto,
	| "id"
	| "orgId"
	| "projectId"
	| "number"
	| "title"
	| "statusId"
	| "status"
	| "priority"
	| "parentId"
>;

export type SubIssueProgressDto = {
	/** Children in a terminal status category (completed or canceled). */
	done: number;
	total: number;
};

/** Issue detail plus hierarchy data rendered on the detail page. */
export type IssueOverviewDto = IssueDetailDto & {
	parent: IssueLinkSummaryDto | null;
	subIssues: IssueLinkSummaryDto[];
	subIssueProgress: SubIssueProgressDto;
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
	/** Structured sort keys; falls back to `sort` when absent. */
	sorts?: IssueQuerySort[];
	/** Structured filter tree, AND-combined with the flat filters. */
	filter?: IssueFilterNode;
	projectId?: string;
};

export type ListIssuesDto = Paginated<IssueDetailDto>;
