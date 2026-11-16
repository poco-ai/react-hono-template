import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const DOM_GLOBALS = [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"Element",
	"Node",
	"Event",
	"KeyboardEvent",
	"MutationObserver",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"getComputedStyle",
] as const;

type Dom = Awaited<ReturnType<typeof createDom>>;

async function createDom() {
	const { Window } = await import("happy-dom");
	const window = new Window({ url: "http://localhost/" });
	const saved = new Map<string, PropertyDescriptor | undefined>();
	for (const key of DOM_GLOBALS) {
		saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Object.defineProperty(globalThis, key, {
			configurable: true,
			value: (window as unknown as Record<string, unknown>)[key],
		});
	}
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	return { window, saved };
}

async function restoreDom({ window, saved }: Dom) {
	for (const [key, descriptor] of saved) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		else Reflect.deleteProperty(globalThis, key);
	}
	Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
	await window.happyDOM.close();
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
	await cleanup?.();
	cleanup = undefined;
});

test("APP_HOTKEYS ids, bindings and descriptions are unique and translated", async () => {
	const { APP_HOTKEYS } = await import("../src/lib/hotkeys");
	const { default: en } = await import("../src/i18n/locales/en");
	const { default: zh } = await import("../src/i18n/locales/zh");

	const entries = Object.values(APP_HOTKEYS);
	const ids = entries.map((entry) => entry.id);
	assert.equal(new Set(ids).size, ids.length, "hotkey ids must be unique");

	const bindings = entries.map((entry) =>
		Array.isArray(entry.hotkey) ? entry.hotkey.join(" ") : entry.hotkey,
	);
	assert.equal(
		new Set(bindings).size,
		bindings.length,
		"hotkey bindings must be unique",
	);

	for (const entry of entries) {
		const key = entry.descriptionKey.replace(/^hotkeys\./, "");
		assert.equal(typeof en.hotkeys[key as keyof typeof en.hotkeys], "string");
		assert.equal(typeof zh.hotkeys[key as keyof typeof zh.hotkeys], "string");
		assert.ok(en.hotkeys[key as keyof typeof en.hotkeys].length > 0);
	}
});

test("hotkey defaults skip single keys in inputs but keep Mod chords", async () => {
	const dom = await createDom();
	cleanup = async () => restoreDom(dom);
	const React = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { HotkeysProvider, useHotkeys } = await import(
		"@tanstack/react-hotkeys"
	);
	const { APP_HOTKEYS, HOTKEY_DEFAULTS, isHotkeyBlocked } = await import(
		"../src/lib/hotkeys"
	);

	const fired: string[] = [];
	function Probe() {
		useHotkeys([
			{
				hotkey: APP_HOTKEYS.navigateProjects.hotkey,
				callback: () => fired.push(APP_HOTKEYS.navigateProjects.id),
			},
			{
				hotkey: APP_HOTKEYS.newIssue.hotkey,
				callback: () => fired.push(APP_HOTKEYS.newIssue.id),
			},
			{
				hotkey: APP_HOTKEYS.toggleCommandPalette.hotkey,
				callback: () => fired.push(APP_HOTKEYS.toggleCommandPalette.id),
			},
		]);
		return null;
	}

	const root = createRoot(dom.window.document.body as unknown as Element);
	cleanup = async () => {
		await React.act(async () => root.unmount());
		await restoreDom(dom);
	};
	await React.act(async () => {
		root.render(
			React.createElement(
				HotkeysProvider as unknown as React.ComponentType<{
					defaultOptions: unknown;
					children?: React.ReactNode;
				}>,
				// Pin the platform so `Mod` resolves to Meta in every CI OS.
				{ defaultOptions: { ...HOTKEY_DEFAULTS, platform: "mac" } },
				React.createElement(Probe),
			),
		);
	});

	const press = async (
		target: EventTarget,
		init: KeyboardEventInit,
	): Promise<KeyboardEvent> => {
		const event = new dom.window.KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			...init,
		} as never);
		await React.act(async () => {
			target.dispatchEvent(event as unknown as Event);
		});
		return event as unknown as KeyboardEvent;
	};

	const input = dom.window.document.createElement("input");
	const textarea = dom.window.document.createElement("textarea");
	const dialog = dom.window.document.createElement("div");
	dialog.setAttribute("role", "dialog");
	dom.window.document.body.append(input, textarea, dialog);

	// Single keys are left to focused text fields.
	assert.equal(
		(await press(input as unknown as EventTarget, { key: "c" }))
			.defaultPrevented,
		false,
	);
	assert.equal(fired.length, 0, "C must not fire from an input");

	// Mod+K keeps working inside inputs (new behavior of ignoreInputs: "auto").
	assert.equal(
		(await press(input as unknown as EventTarget, { key: "k", metaKey: true }))
			.defaultPrevented,
		true,
	);
	assert.deepEqual(fired, [APP_HOTKEYS.toggleCommandPalette.id]);
	fired.length = 0;

	// Vim-style `g p` sequences fire from the page body.
	await press(dom.window.document.body as unknown as EventTarget, { key: "g" });
	await press(dom.window.document.body as unknown as EventTarget, { key: "p" });
	assert.deepEqual(fired, [APP_HOTKEYS.navigateProjects.id]);
	fired.length = 0;

	// Sequences stay out of text fields too.
	await press(textarea as unknown as EventTarget, { key: "g" });
	await press(textarea as unknown as EventTarget, { key: "p" });
	assert.equal(fired.length, 0, "G P must not fire from a textarea");

	// Chords still fire from the body and prevent the browser default.
	const bodyChord = await press(
		dom.window.document.body as unknown as EventTarget,
		{ key: "c" },
	);
	assert.deepEqual(fired, [APP_HOTKEYS.newIssue.id]);
	assert.equal(bodyChord.defaultPrevented, true);

	// The legacy dialog gate still reports open dialogs.
	assert.equal(isHotkeyBlocked(), true);
	dialog.remove();
	assert.equal(isHotkeyBlocked(), false);
});
