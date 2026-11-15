import type {
	HotkeysProviderOptions,
	RegisterableHotkey,
} from "@tanstack/react-hotkeys";

/**
 * Every global shortcut, bound through TanStack Hotkeys. `descriptionKey`
 * points at the i18n entry used by cheat sheets and settings screens; `id`
 * stays stable so custom hotkeys can be stored against it later.
 */
export const APP_HOTKEYS = {
	navigateProjects: {
		id: "nav.projects",
		hotkey: ["G", "P"],
		descriptionKey: "hotkeys.navigateProjects",
	},
	navigateMyIssues: {
		id: "nav.myIssues",
		hotkey: ["G", "I"],
		descriptionKey: "hotkeys.navigateMyIssues",
	},
	navigateActivity: {
		id: "nav.activity",
		hotkey: ["G", "A"],
		descriptionKey: "hotkeys.navigateActivity",
	},
	navigateSettings: {
		id: "nav.settings",
		hotkey: ["G", "S"],
		descriptionKey: "hotkeys.navigateSettings",
	},
	newIssue: {
		id: "issue.create",
		hotkey: "C",
		descriptionKey: "hotkeys.newIssue",
	},
	focusIssueSearch: {
		id: "issue.search",
		hotkey: "/",
		descriptionKey: "hotkeys.focusIssueSearch",
	},
	toggleCommandPalette: {
		id: "palette.toggle",
		hotkey: "Mod+K",
		descriptionKey: "hotkeys.toggleCommandPalette",
	},
	toggleTheme: {
		id: "theme.toggle",
		hotkey: "D",
		descriptionKey: "hotkeys.toggleTheme",
	},
	toggleAiPanel: {
		id: "ai.togglePanel",
		hotkey: "Mod+J",
		descriptionKey: "hotkeys.toggleAiPanel",
	},
} as const satisfies Record<
	string,
	{
		id: string;
		hotkey: RegisterableHotkey;
		descriptionKey: `hotkeys.${string}`;
	}
>;

/**
 * Shared defaults for every registration. Shortcuts must not swallow dialog
 * or cmdk key handling, and single-key bindings stay out of text fields
 * (`ignoreInputs: "auto"`), while Mod chords keep working there.
 */
export const HOTKEY_DEFAULTS = {
	hotkey: {
		ignoreInputs: "auto",
		preventDefault: true,
		stopPropagation: false,
		ignoreDefaultPrevented: true,
		// Held keys emit repeated keydown events; act once until release.
		requireReset: true,
	},
} as const satisfies HotkeysProviderOptions;

/**
 * Legacy page-level gate: shortcuts stand down while a dialog is open, so
 * list actions never fire underneath a modal or the command palette.
 * Focused inputs are left to the adapter (`ignoreInputs: "auto"`).
 */
export function isHotkeyBlocked(): boolean {
	return (
		typeof document !== "undefined" &&
		document.querySelector("[role='dialog']") !== null
	);
}
