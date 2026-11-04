import type { IssueRelationType } from "@workspace/shared";
import type { issueRelations } from "../db/schema";
import type { IssueLinkSummaryDto } from "./issue.dto";

type IssueRelationRow = typeof issueRelations.$inferSelect;

export type IssueRelationLinkDto = {
	/** Relation row id; use it to delete the link. */
	id: string;
	/** Canonical stored direction of this link. */
	type: IssueRelationType;
	/** The issue on the other side of the relation. */
	issue: IssueLinkSummaryDto;
	createdAt: string;
	createdById: string | null;
};

/** Relations grouped from the current issue's point of view. */
export type IssueRelationsDto = {
	blocks: IssueRelationLinkDto[];
	blockedBy: IssueRelationLinkDto[];
	related: IssueRelationLinkDto[];
	duplicates: IssueRelationLinkDto[];
};

export type IssueRelationDto = Omit<IssueRelationRow, "createdAt"> & {
	createdAt: string;
};
