/**
 * Remark plugin that turns `@[Display Name](user:USER_ID)` into a mention node.
 *
 * Markdown is parsed first, so mentions inside inline code, fenced blocks,
 * indented code or blockquote fences are `code`/`inlineCode` nodes and are
 * never visited — no manual code scanning required. The leading `@` stays a
 * sibling text node (remark sees text `@` + link), so it is trimmed here.
 *
 * The label is flattened to plain text: `@[*x*](user:u1)` displays `x`, not
 * emphasis, because a badge cannot (and should not) render arbitrary inline
 * markdown. Only the id is load-bearing for notifications.
 */

import type { Link, Parent, PhrasingContent, Root } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";

const MENTION_URL_PREFIX = "user:";

interface MentionNode extends Parent {
	type: "mention";
	children: PhrasingContent[];
	data: {
		hName: "span";
		hProperties: { "data-mention-id": string };
	};
}

declare module "mdast" {
	// Inline-only node, but `Parent.children` is typed as `RootContent[]`, so
	// both unions must know it for the narrowed `children` type to typecheck.
	interface RootContentMap {
		mention: MentionNode;
	}
	interface PhrasingContentMap {
		mention: MentionNode;
	}
}

/** Returns the trimmed user id in `user:ID`, or null when it is empty. */
const mentionIdFromUrl = (url: string): string | null => {
	if (!url.startsWith(MENTION_URL_PREFIX)) {
		return null;
	}
	const id = url.slice(MENTION_URL_PREFIX.length).trim();
	return id.length > 0 ? id : null;
};

export function remarkMentions() {
	return (tree: Root) => {
		// Collect first: replacing nodes shifts sibling indexes while visiting.
		const links: { link: Link; parent: Parent }[] = [];
		visit(tree, "link", (link, _index, parent) => {
			if (parent && mentionIdFromUrl(link.url)) {
				links.push({ link, parent });
			}
		});

		for (const { link, parent } of links) {
			const id = mentionIdFromUrl(link.url);
			if (!id) {
				continue;
			}
			const index = parent.children.indexOf(link);
			if (index === -1) {
				continue;
			}

			// `@` is a separate text node before the link; drop it so the badge
			// replaces the trigger instead of rendering alongside it.
			const previous = parent.children[index - 1];
			let target = index;
			if (previous?.type === "text" && previous.value.endsWith("@")) {
				const value = previous.value.slice(0, -1);
				if (value) {
					previous.value = value;
				} else {
					parent.children.splice(index - 1, 1);
					target = index - 1;
				}
			}

			const mention: MentionNode = {
				type: "mention",
				data: { hName: "span", hProperties: { "data-mention-id": id } },
				children: [
					{ type: "text", value: mdastToString(link).trim() || "user" },
				],
			};
			parent.children[target] = mention;
		}
	};
}
