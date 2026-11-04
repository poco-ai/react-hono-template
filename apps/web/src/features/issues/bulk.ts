import type { UpdateIssueInput } from "@workspace/shared";

/**
 * Bulk action vocabulary and its conversion to per-issue `PATCH` bodies.
 * Label changes are computed per issue because they add/remove on top of the
 * issue's current labels; everything else is a single shared payload.
 */

export interface BulkIssueRef {
	number: number;
	labelIds: string[];
}

export type BulkIssueAction =
	| { type: "status"; statusId: string }
	| { type: "priority"; priority: number }
	| { type: "assignee"; assigneeId: string | null }
	| { type: "dueDate"; dueDate: string | null }
	| { type: "labels"; add?: string[]; remove?: string[] };

/** Shared payload for actions that apply the same input to every issue. */
export function scalarBulkInput(
	action: BulkIssueAction,
): UpdateIssueInput | null {
	switch (action.type) {
		case "status":
			return { statusId: action.statusId };
		case "priority":
			return { priority: action.priority };
		case "assignee":
			return { assigneeId: action.assigneeId };
		case "dueDate":
			return { dueDate: action.dueDate };
		case "labels":
			return null;
	}
}

/**
 * Computes the next label list for one issue. Removals win over additions so a
 * label listed in both sets is removed. Returns null when nothing changes.
 */
export function labelBulkInput(
	action: Extract<BulkIssueAction, { type: "labels" }>,
	current: readonly string[],
): UpdateIssueInput | null {
	const remove = new Set(action.remove ?? []);
	const next = current.filter((labelId) => !remove.has(labelId));
	for (const labelId of action.add ?? []) {
		if (!remove.has(labelId) && !next.includes(labelId)) {
			next.push(labelId);
		}
	}
	const unchanged =
		next.length === current.length &&
		next.every((labelId, index) => labelId === current[index]);
	return unchanged ? null : { labelIds: next };
}

/** Expands an action into the per-issue updates the bulk mutation sends. */
export function buildBulkUpdates(
	action: BulkIssueAction,
	issues: readonly BulkIssueRef[],
): { number: number; input: UpdateIssueInput }[] {
	const shared = scalarBulkInput(action);
	if (shared) {
		return issues.map((issue) => ({ number: issue.number, input: shared }));
	}
	if (action.type !== "labels") {
		return [];
	}
	const updates: { number: number; input: UpdateIssueInput }[] = [];
	for (const issue of issues) {
		const input = labelBulkInput(action, issue.labelIds);
		if (input) {
			updates.push({ number: issue.number, input });
		}
	}
	return updates;
}
