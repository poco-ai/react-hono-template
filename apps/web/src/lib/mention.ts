/**
 * Mention markup helpers. The API recognises `@[Display Name](user:USER_ID)`
 * (see `parseMentionUserIds` in `@workspace/shared`); the display name is
 * decorative and only the id is load-bearing.
 */

import {
	buildMentionMarkup as buildSharedMentionMarkup,
	createMentionRegex,
} from "@workspace/shared";

export const MENTION_HREF_PREFIX = "mention:";

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

type MarkdownSegment = { text: string; code: boolean };

const FENCE_START = /^( {0,3})(`{3,}|~{3,})/;
const FENCE_END = /^( {0,3})(`{3,}|~{3,})[ \t]*$/;

/**
 * Splits markdown into plain text and code segments (fenced blocks and inline
 * code spans). Mentions inside code are examples, not mentions, so callers can
 * leave those segments untouched.
 */
function splitMarkdownCode(source: string): MarkdownSegment[] {
	const segments: MarkdownSegment[] = [];
	let cursor = 0;
	let textStart = 0;

	const pushText = (end: number) => {
		if (end > textStart) {
			segments.push({ text: source.slice(textStart, end), code: false });
		}
	};
	const pushCode = (start: number, end: number) => {
		pushText(start);
		segments.push({ text: source.slice(start, end), code: true });
		cursor = end;
		textStart = end;
	};

	while (cursor < source.length) {
		const atLineStart = cursor === 0 || source[cursor - 1] === "\n";
		if (atLineStart) {
			const lineEnd = source.indexOf("\n", cursor);
			const line = source.slice(
				cursor,
				lineEnd === -1 ? source.length : lineEnd,
			);
			const fence = FENCE_START.exec(line);
			if (fence) {
				const marker = fence[2];
				let scan = lineEnd === -1 ? source.length : lineEnd + 1;
				let blockEnd = source.length;
				while (scan < source.length) {
					const closeEnd = source.indexOf("\n", scan);
					const closeLine = source.slice(
						scan,
						closeEnd === -1 ? source.length : closeEnd,
					);
					const close = FENCE_END.exec(closeLine);
					if (
						close &&
						close[2][0] === marker[0] &&
						close[2].length >= marker.length
					) {
						blockEnd = closeEnd === -1 ? source.length : closeEnd;
						break;
					}
					if (closeEnd === -1) {
						break;
					}
					scan = closeEnd + 1;
				}
				pushCode(cursor, blockEnd);
				continue;
			}
		}

		if (source[cursor] === "`") {
			let openRun = 1;
			while (source[cursor + openRun] === "`") {
				openRun += 1;
			}
			let scan = cursor + openRun;
			let closeAt = -1;
			while (scan < source.length) {
				const next = source.indexOf("`", scan);
				if (next === -1) {
					break;
				}
				let closeRun = 1;
				while (source[next + closeRun] === "`") {
					closeRun += 1;
				}
				if (closeRun === openRun) {
					closeAt = next;
					break;
				}
				scan = next + closeRun;
			}
			if (closeAt !== -1) {
				pushCode(cursor, closeAt + openRun);
				continue;
			}
			cursor += openRun;
			continue;
		}

		cursor += 1;
	}

	pushText(source.length);
	return segments;
}

/**
 * Rewrites `@[Name](user:ID)` into `[Name](mention:ID)` so react-markdown parses
 * the label as a link node we can render as a mention badge. Code fences and
 * inline code are skipped so examples such as `` `@[a](user:1)` `` stay literal.
 */
export function renderMentionMarkup(body: string): string {
	return splitMarkdownCode(body)
		.map((segment) =>
			segment.code
				? segment.text
				: segment.text.replace(
						createMentionRegex(),
						(_match, name: string, id: string) => {
							const label = name.replace(/[\\[\]]/g, "\\$&").trim() || "user";
							return `[${label}](${MENTION_HREF_PREFIX}${id})`;
						},
					),
		)
		.join("");
}

/** Reads the user id back out of a rendered mention href. */
export const mentionUserIdFromHref = (href: string | undefined) => {
	if (!href?.startsWith(MENTION_HREF_PREFIX)) {
		return null;
	}
	const id = href.slice(MENTION_HREF_PREFIX.length).trim();
	return id.length > 0 ? id : null;
};
