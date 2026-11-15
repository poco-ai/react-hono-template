/**
 * Mention editor helpers. The API recognises `@[Display Name](user:USER_ID)`
 * (see `parseMentionUserIds` in `@workspace/shared`); the display name is
 * decorative and only the id is load-bearing. Rendering is handled by the
 * `remarkMentions` plugin (`lib/remark-mentions.ts`), not by string rewrites.
 */

import { buildMentionMarkup as buildSharedMentionMarkup } from "@workspace/shared";

export type MentionTarget = { id: string; name: string };

export type MentionContext = {
	/** Index of the triggering `@`. */
	start: number;
	/** Caret position when the query was captured. */
	end: number;
	/** Text typed after `@` (no whitespace). */
	query: string;
};

/** Strips characters that would break the surrounding markdown link. */
const sanitizeName = (name: string) =>
	name
		.replace(/[[\]\n\r]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

export const buildMentionMarkup = (name: string, userId: string) =>
	buildSharedMentionMarkup(sanitizeName(name) || "user", userId);

/**
 * Returns the active `@` trigger before the caret, or null. Triggers must start
 * the line/word (whitespace, an opening bracket or a non-ASCII/CJK character
 * before them), so `你好@张` works while emails and URLs stay plain text.
 */
export function getMentionContext(
	value: string,
	caret: number,
): MentionContext | null {
	if (!Number.isInteger(caret) || caret < 0 || caret > value.length) {
		return null;
	}
	const before = value.slice(0, caret);
	const at = before.lastIndexOf("@");
	if (at === -1) {
		return null;
	}
	const previous = at > 0 ? before[at - 1] : "";
	// ASCII word/URL characters (letters, digits, `.`, `/`, `+`, `-`, …) mean
	// this is an email address or part of a URL instead of a mention trigger.
	if (
		previous &&
		!/[\s([{>"']/.test(previous) &&
		previous.charCodeAt(0) < 0x80
	) {
		return null;
	}
	const query = before.slice(at + 1);
	if (query.length > 32 || /\s/.test(query) || query.includes("[")) {
		return null;
	}
	return { start: at, end: caret, query };
}

export function filterMentionCandidates<
	T extends { name: string; email?: string | null },
>(items: readonly T[], query: string, limit = 8): T[] {
	const needle = query.trim().toLowerCase();
	const matched = needle
		? items.filter(
				(item) =>
					item.name.toLowerCase().includes(needle) ||
					(item.email ?? "").toLowerCase().includes(needle),
			)
		: [...items];
	return matched.slice(0, limit);
}

/** Replaces the trigger and query with backend markup, adding a trailing space. */
export function insertMention(
	value: string,
	context: MentionContext,
	target: MentionTarget,
): { value: string; caret: number } {
	const markup = `${buildMentionMarkup(target.name, target.id)} `;
	const next =
		value.slice(0, context.start) + markup + value.slice(context.end);
	return { value: next, caret: context.start + markup.length };
}
