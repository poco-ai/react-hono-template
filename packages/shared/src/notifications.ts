/**
 * Collaboration constants shared by the API and the web app: notification
 * types, why a user is subscribed to an issue, the reaction whitelist and the
 * mention markup parser.
 */

export const NOTIFICATION_TYPES = [
	"issue_assigned",
	"issue_status_changed",
	"issue_commented",
	"comment_reply",
	"comment_mention",
	"comment_resolved",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_FILTERS = ["all", "unread"] as const;

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

/**
 * Why a user follows an issue. Automatic reasons are written when the event
 * happens; `manual` is the explicit toggle in the UI.
 */
export const ISSUE_SUBSCRIPTION_REASONS = [
	"creator",
	"assignee",
	"commenter",
	"mention",
	"manual",
] as const;

export type IssueSubscriptionReason =
	(typeof ISSUE_SUBSCRIPTION_REASONS)[number];

/**
 * Whitelisted reaction emoji. The API rejects anything else so the aggregate
 * stays renderable and the column stays small.
 */
export const COMMENT_REACTION_EMOJIS = [
	"👍",
	"👎",
	"🎉",
	"❤️",
	"🚀",
	"👀",
] as const;

export type CommentReactionEmoji = (typeof COMMENT_REACTION_EMOJIS)[number];

/**
 * Mention markup: `@[Display Name](user:USER_ID)`. The display name is
 * decorative (free text); only the id is load-bearing. Malformed markup is
 * plain text and never becomes a mention.
 *
 * The source is exported so the web editor can reuse the exact grammar
 * instead of drifting with its own copy.
 */
export const MENTION_PATTERN_SOURCE =
	"@\\[([^\\]\\n]*)\\]\\(user:([^)\\s]+)\\)";

/** Fresh global regex (a shared literal would carry `lastIndex` state). */
export const createMentionRegex = (flags = "g"): RegExp =>
	new RegExp(MENTION_PATTERN_SOURCE, flags);

/** Builds mention markup for a member; `name` is display-only. */
export const buildMentionMarkup = (
	displayName: string,
	userId: string,
): string => `@[${displayName}](user:${userId})`;

/**
 * Code spans are not mentions: `@[Ada](user:u1)` inside a fenced block or an
 * inline code span stays literal text (it is an example, not a notification).
 */
export const stripCodeForMentions = (body: string): string =>
	body
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/~~~[\s\S]*?~~~/g, " ")
		.replace(/`[^`\n]*`/g, " ");

/**
 * Upper bound on unique users a single comment may mention. D1 caps bound
 * parameters per statement (~100) and the fan-out inserts one mention row per
 * recipient (2 columns each), so the list is truncated instead of growing
 * unbounded: the first mentions in document order win.
 */
export const MAX_COMMENT_MENTIONS = 20;

export const parseMentionUserIds = (body: string): string[] => {
	const users = new Set<string>();
	for (const match of stripCodeForMentions(body).matchAll(
		createMentionRegex(),
	)) {
		const userId = match[2]?.trim();
		if (userId) {
			users.add(userId);
			if (users.size >= MAX_COMMENT_MENTIONS) {
				break;
			}
		}
	}
	return [...users];
};
