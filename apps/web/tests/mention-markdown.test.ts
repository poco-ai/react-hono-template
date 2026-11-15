import assert from "node:assert/strict";
import { test } from "node:test";
import type { PhrasingContent, Root } from "mdast";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { MarkdownContent } from "../src/components/markdown";
import { remarkMentions } from "../src/lib/remark-mentions";

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMentions);

const parse = (markdown: string): Root =>
	processor.runSync(processor.parse(markdown)) as Root;

type MentionInfo = { id: unknown; label: string };

const labelOf = (children: PhrasingContent[]): string =>
	children
		.map((child) => (child.type === "text" ? child.value : child.type))
		.join("");

const mentions = (markdown: string): MentionInfo[] => {
	const found: MentionInfo[] = [];
	visit(parse(markdown), "mention", (node) => {
		found.push({
			id: node.data.hProperties["data-mention-id"],
			label: labelOf(node.children),
		});
	});
	return found;
};

const childTypes = (markdown: string): string[] => {
	const first = parse(markdown).children[0];
	return first && "children" in first
		? first.children.map((child) => child.type)
		: [];
};

/** Text outside mention labels: label text lives inside the mention node. */
const textValues = (markdown: string): string[] => {
	const values: string[] = [];
	visit(parse(markdown), "text", (node, _index, parent) => {
		if (parent?.type !== "mention") {
			values.push(node.value);
		}
	});
	return values;
};

test("a mention link becomes a span node with the user id and plain label", () => {
	const root = parse("hi @[Alice Chen](user:u1)!");
	const paragraph = root.children[0];
	assert.equal(paragraph.type, "paragraph");
	if (paragraph.type !== "paragraph") {
		return;
	}
	assert.deepEqual(
		paragraph.children.map((child) => child.type),
		["text", "mention", "text"],
	);
	const [before, mention, after] = paragraph.children;
	assert.equal(before.type === "text" && before.value, "hi ");
	assert.equal(after.type === "text" && after.value, "!");
	assert.ok(mention.type === "mention");
	assert.equal(mention.data.hName, "span");
	assert.equal(mention.data.hProperties["data-mention-id"], "u1");
	assert.deepEqual(
		mention.children.map((child) => [child.type, child.value]),
		[["text", "Alice Chen"]],
	);
});

test("mentions inside code are examples and stay literal", () => {
	assert.equal(
		mentions("`@[Ada](user:u1)`").length,
		0,
		"inline code is not a mention",
	);
	assert.deepEqual(childTypes("`@[Ada](user:u1)`"), ["inlineCode"]);

	const fenced = parse("```md\n@[Ada](user:u1)\n```");
	const fence = fenced.children[0];
	assert.ok(fence.type === "code");
	assert.equal(fence.value, "@[Ada](user:u1)");
	assert.equal(mentions("```md\n@[Ada](user:u1)\n```").length, 0);

	const indented = parse("    @[Ada](user:u1)");
	const code = indented.children[0];
	assert.ok(code.type === "code");
	assert.equal(code.value, "@[Ada](user:u1)");
	assert.equal(mentions("    @[Ada](user:u1)").length, 0);

	const quoted = parse("> ```md\n> @[Ada](user:u1)\n> ```");
	const blockquote = quoted.children[0];
	assert.ok(blockquote.type === "blockquote");
	const quotedCode = blockquote.children[0];
	assert.ok(quotedCode.type === "code");
	assert.equal(quotedCode.value, "@[Ada](user:u1)");
	assert.equal(mentions("> ```md\n> @[Ada](user:u1)\n> ```").length, 0);
});

test("mention labels are flattened to text instead of parsed inline markdown", () => {
	const found = mentions("@[*Alice*](user:u1)");
	assert.deepEqual(found, [{ id: "u1", label: "Alice" }]);
	const root = parse("@[*Alice*](user:u1)");
	const paragraph = root.children[0];
	assert.ok(paragraph.type === "paragraph");
	const mention = paragraph.children.find((child) => child.type === "mention");
	assert.ok(mention?.type === "mention");
	assert.deepEqual(
		mention.children.map((child) => [child.type, child.value]),
		[["text", "Alice"]],
	);
});

test("ordinary links and unsafe destinations keep their normal rendering path", () => {
	const root = parse("[docs](https://example.com)");
	const link = root.children[0];
	assert.ok(link.type === "paragraph");
	const anchor = link.children[0];
	assert.ok(anchor.type === "link");
	assert.equal(anchor.url, "https://example.com");
	assert.deepEqual(
		anchor.children.map((child) => [child.type, child.value]),
		[["text", "docs"]],
	);
	assert.equal(mentions("[docs](https://example.com)").length, 0);

	// Empty ids are not mentions; the original link node is left for the URL
	// transform to strip (it renders as plain text).
	assert.deepEqual(childTypes("@[Ada](user:)"), ["text", "link"]);
	assert.equal(mentions("@[Ada](user:)").length, 0);
	assert.deepEqual(textValues("@[Ada](user:)"), ["@", "Ada"]);
});

test("CJK text and adjacent mentions keep their triggers straight", () => {
	assert.deepEqual(mentions("你好@[张伟](user:u1)"), [
		{ id: "u1", label: "张伟" },
	]);
	assert.deepEqual(textValues("你好@[张伟](user:u1)"), ["你好"]);

	assert.deepEqual(mentions("@[A](user:u1)@[B](user:u2)"), [
		{ id: "u1", label: "A" },
		{ id: "u2", label: "B" },
	]);
	assert.deepEqual(childTypes("@[A](user:u1)@[B](user:u2)"), [
		"mention",
		"mention",
	]);
	assert.deepEqual(textValues("@[A](user:u1)@[B](user:u2)"), []);
});

test("mentions inside blockquote text still render as mentions", () => {
	assert.deepEqual(mentions("> hi @[Ada](user:u1)"), [
		{ id: "u1", label: "Ada" },
	]);
});

test("hand-written user: links without a trigger become mentions (no @ to trim)", () => {
	// Rendering is URL-driven now; the previous implementation only rewrote
	// `@[...]` markup and showed these as plain text without a badge.
	assert.deepEqual(mentions("see [Ada](user:u1)"), [
		{ id: "u1", label: "Ada" },
	]);
	assert.deepEqual(textValues("see [Ada](user:u1)"), ["see "]);
});

test("rendered HTML uses a badge and never an anchor", () => {
	const html = renderToStaticMarkup(
		createElement(MarkdownContent, null, "@[Alice](user:u1)"),
	);
	assert.equal(html.includes("<a"), false);
	assert.equal(html.includes("Alice"), true);

	const code = renderToStaticMarkup(
		createElement(MarkdownContent, null, "`@[Alice](user:u1)`"),
	);
	assert.equal(code.includes("<a"), false);
	assert.equal(code.includes("@[Alice](user:u1)"), true);
});
