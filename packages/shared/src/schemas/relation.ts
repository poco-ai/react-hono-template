import { z } from "zod";

/**
 * Canonical storage types. `blocks` is directed (A blocks B); `related` and
 * `duplicates` are symmetric — the pair ids are sorted before storage, so a
 * single row represents the link from both sides.
 */
export const ISSUE_RELATION_TYPES = [
	"blocks",
	"related",
	"duplicates",
] as const;

export type IssueRelationType = (typeof ISSUE_RELATION_TYPES)[number];

/** Directions accepted from API/UI inputs; `blocked_by` is reversed on write. */
export const ISSUE_RELATION_INPUT_TYPES = [
	"blocks",
	"blocked_by",
	"related",
	"duplicates",
] as const;
export type IssueRelationInputType =
	(typeof ISSUE_RELATION_INPUT_TYPES)[number];

export const createIssueRelationSchema = z.object({
	relatedIssueId: z.string().min(1),
	type: z.enum(ISSUE_RELATION_INPUT_TYPES),
});

export type CreateIssueRelationInput = z.infer<
	typeof createIssueRelationSchema
>;
