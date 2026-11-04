import { ISSUE_PRIORITIES, type IssueQueryGroupBy } from "@workspace/shared";

/**
 * Client-side grouping for the issue list. Grouping is display-only: the API
 * paginates first, then the current page's items are bucketed here, so no
 * request or pagination semantics change when the grouping switches.
 */

/** Minimal issue shape required to bucket rows. */
export interface GroupableIssue {
	id: string;
	statusId: string;
	assigneeId: string | null;
	priority: number;
	labelIds: string[];
}

/** One rendered group; `valueId` is null for the empty bucket. */
export interface IssueGroup<T extends GroupableIssue> {
	/** Stable identity for React keys and collapse state. */
	key: string;
	valueId: string | null;
	items: T[];
}

/** Bucket id for rows without a value (unassigned / no labels). */
export const ISSUE_GROUP_EMPTY = "none";

/** Known value orders, taken from the lists rendered elsewhere in the UI. */
export interface IssueGroupOrder {
	statusIds?: readonly string[];
	assigneeIds?: readonly string[];
	labelIds?: readonly string[];
}

function valueOrder(
	groupBy: IssueQueryGroupBy,
	order: IssueGroupOrder,
): readonly string[] {
	switch (groupBy) {
		case "status":
			return order.statusIds ?? [];
		case "assignee":
			return order.assigneeIds ?? [];
		case "label":
			return order.labelIds ?? [];
		case "priority":
			return ISSUE_PRIORITIES.map((entry) => String(entry.value));
	}
}

const groupValuesOf = (
	issue: GroupableIssue,
	groupBy: IssueQueryGroupBy,
): (string | null)[] => {
	switch (groupBy) {
		case "status":
			return [issue.statusId || null];
		case "assignee":
			return [issue.assigneeId ?? null];
		case "priority":
			return [String(issue.priority)];
		case "label": {
			// A multi-label issue appears once per label bucket.
			const labelIds = [...new Set(issue.labelIds)];
			return labelIds.length > 0 ? labelIds : [null];
		}
	}
};

/**
 * Buckets the current page's issues. Known values keep the order supplied by
 * callers (workflow order, member list, label list, priority scale), unknown
 * values follow in first-seen order, and the empty bucket always comes last.
 * Item order inside a bucket is the incoming (server-sorted) order.
 */
export function groupIssues<T extends GroupableIssue>(
	items: readonly T[],
	groupBy: IssueQueryGroupBy,
	order: IssueGroupOrder = {},
): IssueGroup<T>[] {
	const buckets = new Map<string | null, T[]>();
	for (const issue of items) {
		for (const valueId of groupValuesOf(issue, groupBy)) {
			const bucket = buckets.get(valueId);
			if (bucket) {
				bucket.push(issue);
			} else {
				buckets.set(valueId, [issue]);
			}
		}
	}

	const keys: string[] = [];
	const seen = new Set<string>();
	for (const valueId of valueOrder(groupBy, order)) {
		if (buckets.has(valueId) && !seen.has(valueId)) {
			seen.add(valueId);
			keys.push(valueId);
		}
	}
	for (const valueId of buckets.keys()) {
		if (valueId !== null && !seen.has(valueId)) {
			seen.add(valueId);
			keys.push(valueId);
		}
	}
	if (buckets.has(null)) {
		keys.push(ISSUE_GROUP_EMPTY);
	}

	return keys.map((key) => {
		const valueId = key === ISSUE_GROUP_EMPTY ? null : key;
		return {
			key: `${groupBy}:${key}`,
			valueId,
			items: buckets.get(valueId) ?? [],
		};
	});
}
