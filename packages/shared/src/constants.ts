export const ISSUE_STATUSES = [
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"canceled",
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const TERMINAL_ISSUE_STATUSES = ["done", "canceled"] as const;

export const ISSUE_PRIORITY = {
	none: 0,
	urgent: 1,
	high: 2,
	medium: 3,
	low: 4,
} as const;

export type IssuePriorityName = keyof typeof ISSUE_PRIORITY;

export const ISSUE_PRIORITIES = [
	{ value: ISSUE_PRIORITY.none, name: "none" },
	{ value: ISSUE_PRIORITY.urgent, name: "urgent" },
	{ value: ISSUE_PRIORITY.high, name: "high" },
	{ value: ISSUE_PRIORITY.medium, name: "medium" },
	{ value: ISSUE_PRIORITY.low, name: "low" },
] as const;

const PRIORITY_NAMES = new Map<number, IssuePriorityName>(
	ISSUE_PRIORITIES.map((priority) => [priority.value, priority.name]),
);

export function priorityName(value: number): IssuePriorityName {
	return PRIORITY_NAMES.get(value) ?? "none";
}

export function priorityValue(name: IssuePriorityName): number {
	return ISSUE_PRIORITY[name];
}

export const WEBHOOK_EVENTS = [
	"issue.created",
	"issue.updated",
	"issue.status_changed",
	"issue.deleted",
	"comment.created",
	"attachment.added",
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];
