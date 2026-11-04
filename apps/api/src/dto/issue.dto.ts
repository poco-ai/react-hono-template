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
	"createdAt" | "updatedAt" | "dueDate" | "deletedAt" | "archivedAt"
> & {
	createdAt: string;
	updatedAt: string;
	dueDate: string | null;
	deletedAt: string | null;
	/** Set while the issue is archived (hidden from lists/search/progress). */
	archivedAt?: string | null;
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
	cycleId?: string;
	/** Defaults to false: archived issues are hidden from lists. */
	includeArchived?: boolean;
};

export type ListIssuesDto = Paginated<IssueDetailDto>;

/** Result of a project CSV export (already serialized). */
export type IssueExportResultDto = {
	csv: string;
	filename: string;
	/** Active rows written to the CSV (capped by `exportLimit`). */
	exported: number;
	/** Active rows that matched, before truncation. */
	total: number;
	truncated: boolean;
};

/**
 * Triage row: an issue waiting for an owner (status category `backlog` and no
 * assignee) with just enough project/status data to render the queue.
 */
export type TriageIssueDto = {
	id: string;
	projectId: string;
	projectKey: string;
	number: number;
	identifier: string;
	title: string;
	statusId: string;
	statusName: string;
	statusCategory: string;
	statusColor: string;
	priority: number;
	createdById: string | null;
	createdAt: string;
};

export type TriageListDto = {
	items: TriageIssueDto[];
};
