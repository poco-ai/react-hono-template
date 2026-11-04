import {
	type CreateIssueInput,
	type IssuePriorityName,
	priorityValue,
} from "@workspace/shared";
import { fromDateInputValue } from "@/lib/format";

/** Raw text/select state owned by the create-issue dialog. */
export type CreateIssueFormState = {
	title: string;
	description: string;
	statusId?: string;
	priority: IssuePriorityName;
	assigneeId?: string;
	labelIds: string[];
	dueDate: string;
	estimate: string;
	/** Optional planning cycle of the same project. */
	cycleId?: string;
};

/**
 * Parent id for a sub-issue created from `SubIssuesSection`. The current
 * issue's real id is used for top-level issues; issues that already have a
 * parent cannot own sub-issues (two-level limit), so their add button is
 * disabled and no parent id is produced.
 */
export const subIssueParentId = ({
	issueId,
	isSubIssue,
}: {
	issueId: string;
	isSubIssue: boolean;
}): string | undefined => (isSubIssue ? undefined : issueId);

/**
 * Builds the mutation variables for `createIssue` from dialog state.
 *
 * `parentId` is passed separately because it is not a form field: the plain
 * create dialog leaves it undefined, while the sub-issues section passes the
 * current issue's id so the new issue is created underneath it.
 */
export const buildCreateIssueInput = (
	form: CreateIssueFormState,
	{ parentId }: { parentId?: string } = {},
): CreateIssueInput => {
	const estimate = form.estimate === "" ? undefined : Number(form.estimate);
	return {
		title: form.title.trim(),
		description: form.description.trim() || undefined,
		statusId: form.statusId,
		priority: priorityValue(form.priority),
		assigneeId: form.assigneeId,
		labelIds: form.labelIds.length > 0 ? form.labelIds : undefined,
		dueDate: fromDateInputValue(form.dueDate) ?? undefined,
		estimate:
			estimate !== undefined && Number.isInteger(estimate) && estimate >= 0
				? estimate
				: undefined,
		cycleId: form.cycleId || undefined,
		parentId,
	};
};
