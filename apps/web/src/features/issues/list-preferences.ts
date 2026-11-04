import { useCallback, useEffect, useState } from "react";

/**
 * List display preferences (density + visible columns). They never touch the
 * saved view or the API; only localStorage, scoped per user.
 */

export const ISSUE_LIST_COLUMNS = [
	"status",
	"priority",
	"assignee",
	"labels",
	"dueDate",
	"createdAt",
	"updatedAt",
	"estimate",
] as const;

export type IssueListColumn = (typeof ISSUE_LIST_COLUMNS)[number];

export const DEFAULT_LIST_COLUMNS: readonly IssueListColumn[] = [
	"status",
	"priority",
	"assignee",
	"labels",
	"dueDate",
	"updatedAt",
];

export const ISSUE_LIST_DENSITIES = ["comfortable", "compact"] as const;

export type IssueListDensity = (typeof ISSUE_LIST_DENSITIES)[number];

export const DEFAULT_LIST_DENSITY: IssueListDensity = "comfortable";

/** Extra row/cell spacing applied for each density. */
export const LIST_DENSITY_ROW_CLASS: Record<IssueListDensity, string> = {
	comfortable: "",
	compact: "[&>td]:py-1! [&>td]:text-[13px]",
};

export const listPreferenceKey = (
	kind: "columns" | "density",
	userId?: string | null,
) => (userId ? `issue-list:${kind}:${userId}` : `issue-list:${kind}`);

export const isIssueListColumn = (value: unknown): value is IssueListColumn =>
	typeof value === "string" &&
	(ISSUE_LIST_COLUMNS as readonly string[]).includes(value);

/**
 * Parses persisted/URL column lists (array or JSON string). Unknown entries are
 * dropped, duplicates collapse, and an empty/invalid selection falls back to
 * the defaults so the table always keeps at least one property column.
 */
export function parseListColumns(value: unknown): IssueListColumn[] {
	let candidate = value;
	if (typeof candidate === "string") {
		if (!candidate.trim()) {
			return [...DEFAULT_LIST_COLUMNS];
		}
		try {
			candidate = JSON.parse(candidate);
		} catch {
			return [...DEFAULT_LIST_COLUMNS];
		}
	}
	if (!Array.isArray(candidate)) {
		return [...DEFAULT_LIST_COLUMNS];
	}
	const columns: IssueListColumn[] = [];
	for (const entry of candidate) {
		if (isIssueListColumn(entry) && !columns.includes(entry)) {
			columns.push(entry);
		}
	}
	return columns.length > 0 ? columns : [...DEFAULT_LIST_COLUMNS];
}

/** Invalid density values fall back to comfortable instead of throwing. */
export function parseListDensity(value: unknown): IssueListDensity {
	const normalized =
		typeof value === "string" ? value.trim().replace(/^"|"$/g, "") : "";
	return (ISSUE_LIST_DENSITIES as readonly string[]).includes(normalized)
		? (normalized as IssueListDensity)
		: DEFAULT_LIST_DENSITY;
}

/** Toggles a column, refusing to drop the last remaining property column. */
export function toggleListColumn(
	columns: readonly IssueListColumn[],
	column: IssueListColumn,
	checked: boolean,
): IssueListColumn[] {
	if (checked) {
		return columns.includes(column) ? [...columns] : [...columns, column];
	}
	if (!columns.includes(column) || columns.length <= 1) {
		return [...columns];
	}
	return columns.filter((entry) => entry !== column);
}

const storage = (): Storage | null => {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
};

export function readListColumns(
	userId?: string | null,
	store: Pick<Storage, "getItem"> | null = storage(),
): IssueListColumn[] {
	try {
		const raw = store?.getItem(listPreferenceKey("columns", userId));
		return raw ? parseListColumns(raw) : [...DEFAULT_LIST_COLUMNS];
	} catch {
		return [...DEFAULT_LIST_COLUMNS];
	}
}

export function readListDensity(
	userId?: string | null,
	store: Pick<Storage, "getItem"> | null = storage(),
): IssueListDensity {
	try {
		const raw = store?.getItem(listPreferenceKey("density", userId));
		return raw === null || raw === undefined
			? DEFAULT_LIST_DENSITY
			: parseListDensity(raw);
	} catch {
		return DEFAULT_LIST_DENSITY;
	}
}

export function writeListColumns(
	userId: string | null | undefined,
	columns: readonly IssueListColumn[],
	store: Pick<Storage, "setItem"> | null = storage(),
) {
	try {
		store?.setItem(
			listPreferenceKey("columns", userId),
			JSON.stringify(columns),
		);
	} catch {
		// Storage can be unavailable (private mode); preferences stay in memory.
	}
}

export function writeListDensity(
	userId: string | null | undefined,
	density: IssueListDensity,
	store: Pick<Storage, "setItem"> | null = storage(),
) {
	try {
		store?.setItem(listPreferenceKey("density", userId), density);
	} catch {
		// Storage can be unavailable (private mode); preferences stay in memory.
	}
}

/**
 * Reads the signed-in user's list preferences and keeps localStorage in sync.
 * Re-reads once the session resolves so pre-login reads of the anonymous key
 * do not leak into the user's stored preferences.
 */
export function useIssueListPreferences(userId?: string | null) {
	const [columns, setColumnsState] = useState<IssueListColumn[]>(() =>
		readListColumns(userId),
	);
	const [density, setDensityState] = useState<IssueListDensity>(() =>
		readListDensity(userId),
	);
	const [loadedFor, setLoadedFor] = useState<string | null>(userId ?? null);

	useEffect(() => {
		if (!userId || userId === loadedFor) {
			return;
		}
		setLoadedFor(userId);
		setColumnsState(readListColumns(userId));
		setDensityState(readListDensity(userId));
	}, [userId, loadedFor]);

	const setColumns = useCallback(
		(next: readonly IssueListColumn[]) => {
			const parsed = parseListColumns([...next]);
			setColumnsState(parsed);
			writeListColumns(userId, parsed);
		},
		[userId],
	);

	const toggleColumn = useCallback(
		(column: IssueListColumn, checked: boolean) => {
			setColumnsState((previous) => {
				const next = toggleListColumn(previous, column, checked);
				writeListColumns(userId, next);
				return next;
			});
		},
		[userId],
	);

	const setDensity = useCallback(
		(next: IssueListDensity) => {
			const parsed = parseListDensity(next);
			setDensityState(parsed);
			writeListDensity(userId, parsed);
		},
		[userId],
	);

	return { columns, density, setColumns, toggleColumn, setDensity };
}
