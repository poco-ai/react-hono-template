/**
 * Compact plain-text excerpt for previews (activities, notifications):
 * markdown and mention markup is unwrapped, whitespace collapsed, and the
 * result truncated to `max` characters with an ellipsis.
 */
export const excerptOf = (
	text: string,
	{ max = 120 }: { max?: number } = {},
): string => {
	const compact = text.replace(/\s+/g, " ").trim();
	return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
};

/** Markdown-stripping excerpt used for comment previews. */
export const commentExcerpt = (body: string): string => {
	const plain = body
		// Fence markers (and their language hint) are markup; keep the code text.
		.replace(/```[^\n]*\n?/g, " ")
		.replace(/~~~[^\n]*\n?/g, " ")
		.replace(/`([^`\n]*)`/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/@\[([^\]\n]*)\]\(user:[^)\s]+\)/g, "@$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^>\s?/gm, "")
		.replace(/^\s{0,3}[-*+]\s+/gm, "")
		.replace(/[*_~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return plain.length > 120 ? `${plain.slice(0, 117)}...` : plain;
};
