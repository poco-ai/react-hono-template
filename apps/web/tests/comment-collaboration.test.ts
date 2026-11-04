import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommentDto } from "@api/dto/comment.dto";
import { COMMENT_REACTION_EMOJIS } from "@workspace/shared";
import {
	applyReactionToggle,
	groupCommentThreads,
} from "../src/features/comments/data";
import {
	buildMentionMarkup,
	filterMentionCandidates,
	getMentionContext,
	insertMention,
	renderMentionMarkup,
} from "../src/lib/mention";

const comment = (
	id: string,
	overrides: Partial<CommentDto> = {},
): CommentDto => ({
	id,
	orgId: "org",
	issueId: "issue",
	parentId: null,
	body: id,
	author: {
		id: "author",
		name: "Author",
		email: "author@example.com",
		image: null,
	},
	createdAt: `2026-01-0${id.length}T00:00:00.000Z`,
	updatedAt: `2026-01-0${id.length}T00:00:00.000Z`,
	resolvedAt: null,
	resolvedById: null,
	attachments: [],
	reactions: [],
	mentions: [],
	...overrides,
});

test("threads group replies under their top-level comment in time order", () => {
	const threads = groupCommentThreads([
		comment("a", { createdAt: "2026-01-01T10:00:00.000Z" }),
		comment("b", {
			parentId: "a",
			createdAt: "2026-01-01T10:02:00.000Z",
		}),
		comment("c", { createdAt: "2026-01-01T09:00:00.000Z" }),
		comment("d", {
			parentId: "c",
			createdAt: "2026-01-01T09:01:00.000Z",
		}),
		comment("e", {
			parentId: "a",
			createdAt: "2026-01-01T10:01:00.000Z",
		}),
	]);
	assert.equal(threads.length, 2);
	assert.deepEqual(
		threads.map((thread) => thread.comment.id),
		["c", "a"],
	);
	assert.deepEqual(
		threads[1]?.replies.map((reply) => reply.id),
		["e", "b"],
	);
	assert.equal(threads[1]?.orphan, false);
});

test("orphan replies stay visible when their parent page is not loaded", () => {
	const threads = groupCommentThreads([
		comment("root", { createdAt: "2026-01-01T08:00:00.000Z" }),
		comment("orphan", {
			parentId: "missing-parent",
			createdAt: "2026-01-02T08:00:00.000Z",
		}),
	]);
	assert.equal(threads.length, 2);
	const orphan = threads.find((thread) => thread.comment.id === "orphan");
	assert.equal(orphan?.orphan, true);
	assert.equal(orphan?.replies.length, 0);
});

test("mention triggers only after an @ at a word boundary and without spaces", () => {
	assert.deepEqual(getMentionContext("hello @al", 9), {
		start: 6,
		end: 9,
		query: "al",
	});
	assert.deepEqual(getMentionContext("@", 1), {
		start: 0,
		end: 1,
		query: "",
	});
	assert.equal(getMentionContext("mail@example", 12), null);
	assert.equal(getMentionContext("hello @al ice", 13), null);
	// Existing markup must not reopen the picker.
	assert.equal(getMentionContext("@[Alice](user:1)", 16), null);
});

test("mention triggers after CJK text but not inside emails or URLs", () => {
	assert.deepEqual(getMentionContext("你好@张", 4), {
		start: 2,
		end: 4,
		query: "张",
	});
	assert.deepEqual(getMentionContext("你好，@张", 5), {
		start: 3,
		end: 5,
		query: "张",
	});
	assert.equal(getMentionContext("foo.bar@example.com", 19), null);
	assert.equal(getMentionContext("https://example.com/@al", 23), null);
});

test("inserting a mention writes backend markup and places the caret after it", () => {
	const value = "ping @al please";
	const context = getMentionContext(value, 8);
	assert.ok(context);
	const result = insertMention(value, context, {
		id: "u1",
		name: "Alice Chen",
	});
	assert.equal(result.value, "ping @[Alice Chen](user:u1)  please");
	assert.equal(result.caret, "ping @[Alice Chen](user:u1) ".length);
	assert.equal(buildMentionMarkup("Bad [Name]", "u2"), "@[Bad Name](user:u2)");
});

test("mention candidates match names and emails case-insensitively", () => {
	const members = [
		{ id: "1", name: "Alice Chen", email: "alice@example.com" },
		{ id: "2", name: "Bob Li", email: "bob@example.com" },
		{ id: "3", name: "Carol Wu", email: "carol@example.com" },
	];
	assert.deepEqual(
		filterMentionCandidates(members, "AL").map((member) => member.id),
		["1"],
	);
	assert.deepEqual(
		filterMentionCandidates(members, "example").map((member) => member.id),
		["1", "2", "3"],
	);
	assert.equal(filterMentionCandidates(members, "", 2).length, 2);
});

test("rendering rewrites mention markup into badges, never user: links", () => {
	const rendered = renderMentionMarkup("hi @[Alice Chen](user:u1)!");
	assert.equal(rendered, "hi [Alice Chen](mention:u1)!");
	assert.ok(!rendered.includes("(user:"));
	assert.equal(
		renderMentionMarkup("[docs](https://example.com) @[Bob](user:u2)"),
		"[docs](https://example.com) [Bob](mention:u2)",
	);
});

test("mention rendering leaves fenced and inline code untouched", () => {
	const inline = "`@[Ada](user:u1)`";
	const fenced = "```md\n@[Ada](user:u1)\n```";
	assert.equal(renderMentionMarkup(inline), inline);
	assert.equal(renderMentionMarkup(fenced), fenced);
	assert.equal(
		renderMentionMarkup("`code` @[Ada](user:u1)"),
		"`code` [Ada](mention:u1)",
	);
});

test("reaction toggling adds, removes and re-orders within the whitelist order", () => {
	const up = COMMENT_REACTION_EMOJIS[0];
	const tada = COMMENT_REACTION_EMOJIS[2];
	const added = applyReactionToggle([], up);
	assert.deepEqual(added, [{ emoji: up, count: 1, mine: true }]);
	const ordered = applyReactionToggle(added, tada);
	assert.deepEqual(
		ordered.map((reaction) => reaction.emoji),
		[up, tada],
	);
	const removed = applyReactionToggle(ordered, up);
	assert.deepEqual(removed, [{ emoji: tada, count: 1, mine: true }]);
	const shared = applyReactionToggle(
		[{ emoji: tada, count: 2, mine: false }],
		tada,
	);
	assert.deepEqual(shared, [{ emoji: tada, count: 3, mine: true }]);
	const untoggled = applyReactionToggle(shared, tada);
	assert.deepEqual(untoggled, [{ emoji: tada, count: 2, mine: false }]);
});
