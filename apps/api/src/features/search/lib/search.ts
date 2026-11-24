import { SEARCH_MAX_QUERY_LENGTH } from "@workspace/shared";

/** Upper bound on query terms: keeps the generated SQL and FTS expression small. */
export const SEARCH_MAX_TERMS = 8;

/** Shortest term the trigram tokenizer can match (three characters). */
export const SEARCH_TRIGRAM_MIN_LENGTH = 3;

export type SearchTerms = {
	/** Whitespace-collapsed query, also used for `instr()` fallbacks. */
	raw: string;
	/** All parsed terms (deduped, capped). */
	tokens: string[];
	/** Terms handled by the FTS5 trigram index. */
	ftsTokens: string[];
	/** Terms too short for trigram matching; matched with `instr()`. */
	shortTokens: string[];
	/** Quoted FTS5 expression (terms AND-combined) or null when none qualify. */
	ftsQuery: string | null;
};

/**
 * Control characters (Unicode category Cc: C0 controls, DEL and C1 controls).
 * SQLite terminates string literals at a NUL byte, so a `\u0000` inside a
 * quoted FTS5 phrase raises "unterminated string" and would surface as a 500.
 * They are stripped (replaced with spaces) before tokenizing; the HTTP layer
 * also allows arbitrary user input, so this must stay defensive rather than
 * rely on schema validation.
 */
const CONTROL_CHARS = /[\p{Cc}]/gu;

/**
 * Splits a raw query into search terms.
 *
 * Every term is wrapped in double quotes with embedded quotes doubled, so user
 * input can never be interpreted as FTS5 syntax (`*`, `-`, `:`, parentheses or
 * a stray `"` are treated literally). Terms shorter than three characters are
 * kept separate because the trigram tokenizer cannot index/match them; callers
 * match those with `instr()`.
 */
export const buildSearchTerms = (query: string): SearchTerms => {
	const raw = query
		.replace(CONTROL_CHARS, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, SEARCH_MAX_QUERY_LENGTH);
	const tokens = raw
		? [...new Set(raw.split(" "))].slice(0, SEARCH_MAX_TERMS)
		: [];
	const ftsTokens = tokens.filter(
		(token) => [...token].length >= SEARCH_TRIGRAM_MIN_LENGTH,
	);
	const shortTokens = tokens.filter(
		(token) => [...token].length < SEARCH_TRIGRAM_MIN_LENGTH,
	);
	const ftsQuery =
		ftsTokens.length > 0
			? ftsTokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" ")
			: null;
	return { raw, tokens, ftsTokens, shortTokens, ftsQuery };
};

const EXCERPT_LENGTH = 160;
const EXCERPT_LEAD = 40;

/**
 * Compact one-line excerpt for a search hit. Prefers a window around the first
 * matched term; falls back to the leading characters (e.g. when only the title
 * matched and the description has no occurrence).
 */
export const searchExcerpt = (
	text: string | null | undefined,
	terms: SearchTerms,
	maxLength = EXCERPT_LENGTH,
): string | null => {
	if (!text) {
		return null;
	}
	const flat = text.replace(/\s+/g, " ").trim();
	if (!flat) {
		return null;
	}
	const lowered = flat.toLowerCase();
	let index = -1;
	for (const token of [terms.raw, ...terms.tokens]) {
		const found = lowered.indexOf(token.toLowerCase());
		if (found >= 0 && (index < 0 || found < index)) {
			index = found;
		}
	}
	if (index < 0) {
		return flat.length > maxLength
			? `${flat.slice(0, maxLength).trimEnd()}…`
			: flat;
	}
	const start = Math.max(0, index - EXCERPT_LEAD);
	const end = Math.min(flat.length, start + maxLength);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < flat.length ? "…" : "";
	return `${prefix}${flat.slice(start, end).trim()}${suffix}`;
};
