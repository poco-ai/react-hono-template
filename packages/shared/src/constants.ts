/**
 * @deprecated Workflow statuses are organization data (`issue_statuses`) now.
 * These names are still accepted by the API as a compatibility layer for
 * create/update/filter inputs, but new code must use `statusId`.
 */
export const ISSUE_STATUSES = [
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"canceled",
] as const;

/** @deprecated Use `STATUS_CATEGORIES` and `category === "completed"`. */
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/**
 * @deprecated Terminal state is derived from the status category. Kept only
 * so existing imports keep compiling.
 */
export const TERMINAL_ISSUE_STATUSES = ["done", "canceled"] as const;

/** Fixed workflow categories every organization status belongs to. */
export const STATUS_CATEGORIES = [
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
] as const;

export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const TERMINAL_STATUS_CATEGORIES = [
	"completed",
	"canceled",
] as const satisfies readonly StatusCategory[];

export const isTerminalStatusCategory = (
	category: string,
): category is (typeof TERMINAL_STATUS_CATEGORIES)[number] =>
	(TERMINAL_STATUS_CATEGORIES as readonly string[]).includes(category);

/** Hex colors used by the default statuses and new-status suggestions. */
export const STATUS_CATEGORY_COLORS: Record<StatusCategory, string> = {
	backlog: "#64748b",
	unstarted: "#3b82f6",
	started: "#f59e0b",
	completed: "#22c55e",
	canceled: "#94a3b8",
};

export type DefaultIssueStatus = {
	name: string;
	category: StatusCategory;
	color: string;
	position: number;
	isDefault: boolean;
};

/**
 * Statuses seeded for every organization (existing orgs through the migration,
 * new orgs through the better-auth organization hook). `Backlog` is the
 * default for newly created issues.
 */
export const DEFAULT_ISSUE_STATUSES: readonly DefaultIssueStatus[] = [
	{
		name: "Backlog",
		category: "backlog",
		color: STATUS_CATEGORY_COLORS.backlog,
		position: 0,
		isDefault: true,
	},
	{
		name: "Todo",
		category: "unstarted",
		color: STATUS_CATEGORY_COLORS.unstarted,
		position: 1,
		isDefault: false,
	},
	{
		name: "In Progress",
		category: "started",
		color: STATUS_CATEGORY_COLORS.started,
		position: 2,
		isDefault: false,
	},
	{
		name: "In Review",
		category: "started",
		color: "#a855f7",
		position: 3,
		isDefault: false,
	},
	{
		name: "Done",
		category: "completed",
		color: STATUS_CATEGORY_COLORS.completed,
		position: 4,
		isDefault: false,
	},
	{
		name: "Canceled",
		category: "canceled",
		color: STATUS_CATEGORY_COLORS.canceled,
		position: 5,
		isDefault: false,
	},
];

/**
 * Normalizes a display name to a stable key so legacy status codes such as
 * `in_progress` keep resolving to the seeded `In Progress` status.
 */
export const normalizeStatusNameKey = (value: string) =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

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
