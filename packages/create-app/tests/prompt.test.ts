import assert from "node:assert/strict";
import test from "node:test";
import {
	buildSummary,
	collectMissingInput,
	type PromptRequest,
	type PromptUi,
} from "../src/prompt";

const CANCEL = Symbol("clack:cancel");

type Script = {
	text?: string | symbol;
	select?: string | symbol;
	multiselect?: string[] | symbol;
	confirm?: boolean | symbol;
};

/** A PromptUi fake that replays scripted answers and records every call. */
function fakeUi(script: Script): { ui: PromptUi; calls: string[] } {
	const calls: string[] = [];
	const ui: PromptUi = {
		intro: (title) => calls.push(`intro:${title}`),
		outro: (message) => calls.push(`outro:${message}`),
		text: async (opts) => {
			calls.push(`text:${opts.message}`);
			return script.text ?? "./out";
		},
		select: async (opts) => {
			calls.push(`select:${opts.message}`);
			return script.select ?? "minimal";
		},
		multiselect: async (opts) => {
			calls.push(`multiselect:${opts.message}`);
			return script.multiselect ?? [];
		},
		confirm: async (opts) => {
			calls.push(`confirm:${opts.message}`);
			return script.confirm ?? true;
		},
		note: (message, title) => calls.push(`note:${title ?? ""}:${message}`),
		cancel: (message) => calls.push(`cancel:${message ?? ""}`),
		isCancel: (value): value is symbol => value === CANCEL,
	};
	return { ui, calls };
}

test("complete flags skip every prompt", async () => {
	const { ui, calls } = fakeUi({});
	const result = await collectMissingInput(
		{ dir: "d", preset: "saas" } satisfies PromptRequest,
		ui,
	);
	assert.deepEqual(result, {
		status: "ready",
		dir: "d",
		selection: { preset: "saas" },
		requestedFeatures: null,
	});
	assert.deepEqual(calls, []);
});

test("asks for the directory only when a preset flag is given", async () => {
	const { ui, calls } = fakeUi({ text: "./from-prompt" });
	const result = await collectMissingInput({ preset: "minimal" }, ui);
	assert.equal(result.status, "ready");
	if (result.status === "ready") {
		assert.equal(result.dir, "./from-prompt");
		assert.deepEqual(result.selection, { preset: "minimal" });
	}
	assert.deepEqual(calls, ["text:Where should the project be created?"]);
});

test("interactive preset choice resolves to the preset selection", async () => {
	const { ui, calls } = fakeUi({ text: "./x", select: "planning" });
	const result = await collectMissingInput({}, ui);
	assert.equal(result.status, "ready");
	if (result.status === "ready") {
		assert.deepEqual(result.selection, { preset: "planning" });
		assert.equal(result.requestedFeatures, null);
	}
	assert.deepEqual(calls, [
		"text:Where should the project be created?",
		"select:How do you want to start?",
	]);
});

test("custom choice shows the base note and returns the picked features", async () => {
	const { ui, calls } = fakeUi({
		text: "./x",
		select: "custom",
		multiselect: ["billing", "ai"],
	});
	const result = await collectMissingInput({}, ui);
	assert.equal(result.status, "ready");
	if (result.status === "ready") {
		assert.deepEqual(result.selection, { features: ["billing", "ai"] });
		assert.deepEqual(result.requestedFeatures, ["billing", "ai"]);
	}
	assert.equal(
		calls.filter((call) => call.startsWith("note:Minimal base")).length,
		1,
	);
	assert.equal(
		calls.filter((call) => call.startsWith("multiselect:Pick additional"))
			.length,
		1,
	);
});

test("custom choice with no extras is a valid minimal selection", async () => {
	const { ui } = fakeUi({ text: "./x", select: "custom", multiselect: [] });
	const result = await collectMissingInput({}, ui);
	assert.equal(result.status, "ready");
	if (result.status === "ready") {
		assert.deepEqual(result.selection, { features: [] });
	}
});

test("cancel at the directory prompt aborts before any write", async () => {
	const { ui } = fakeUi({ text: CANCEL });
	const result = await collectMissingInput({}, ui);
	assert.deepEqual(result, { status: "cancelled" });
});

test("cancel at the start-from prompt aborts", async () => {
	const { ui } = fakeUi({ text: "./x", select: CANCEL });
	const result = await collectMissingInput({}, ui);
	assert.deepEqual(result, { status: "cancelled" });
});

test("cancel at the feature picker aborts", async () => {
	const { ui } = fakeUi({ text: "./x", select: "custom", multiselect: CANCEL });
	const result = await collectMissingInput({}, ui);
	assert.deepEqual(result, { status: "cancelled" });
});

test("buildSummary lists extras and auto-included dependencies", () => {
	const summary = buildSummary(
		["billing"],
		{
			name: "custom",
			mode: "custom",
			features: [
				{ id: "core" },
				{ id: "projects" },
				{ id: "issues" },
				{ id: "billing" },
				{ id: "webhooks" },
			],
		},
		"/tmp/out",
	);
	assert.match(summary, /Custom selection — 5 features/);
	assert.match(summary, /Extras: billing, webhooks/);
	assert.match(summary, /Auto-included dependencies: webhooks/);
	assert.match(summary, /Output: \/tmp\/out/);
});

test("buildSummary for a preset stays compact", () => {
	const summary = buildSummary(
		null,
		{
			name: "saas",
			mode: "preset",
			features: [{ id: "core" }, { id: "billing" }],
		},
		"/tmp/out",
	);
	assert.equal(
		summary,
		['Preset "saas" — 2 features', "Output: /tmp/out"].join("\n"),
	);
});
