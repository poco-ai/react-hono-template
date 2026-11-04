import {
	ISSUE_CSV_COLUMNS,
	ISSUE_CSV_MAX_IMPORT_ROWS,
	type IssueImportRow,
	parseCsvText,
} from "@workspace/shared";

/** Browser-side upload guard; the API also caps rows at 100. */
export const ISSUE_CSV_MAX_FILE_BYTES = 1024 * 1024;

/** Rows shown in the import preview table. */
export const ISSUE_CSV_PREVIEW_ROWS = 5;

export type IssueCsvErrorCode =
	| "missingHeader"
	| "missingTitleColumn"
	| "tooManyRows"
	| "empty"
	| "titleRequired"
	| "titleTooLong"
	| "descriptionTooLong"
	| "priorityInvalid"
	| "estimateInvalid"
	| "dueDateInvalid";

export type IssueCsvRowError = {
	/** 1-based data-row index (header excluded, blank rows skipped). */
	row: number;
	code: IssueCsvErrorCode;
	/** Offending value for display, when useful. */
	value?: string;
};

export type IssueCsvPreview = {
	/** Normalized header names, in file order. */
	headers: string[];
	/** Mapped import rows (only the shared import columns). */
	rows: IssueImportRow[];
	/** First `ISSUE_CSV_PREVIEW_ROWS` rows, for the dialog table. */
	previewRows: IssueImportRow[];
	errors: IssueCsvRowError[];
	/** Blocking problems: no usable header, empty file or too many rows. */
	fatal: boolean;
	/** Header errors are also mirrored in `errors` with row 0. */
};

const PRIORITY_NAMES = new Set(["none", "urgent", "high", "medium", "low"]);

const isDateValue = (value: string) =>
	/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isNaN(Date.parse(value));

/**
 * Pure CSV → import-row mapping used by the upload dialog. The API re-validates
 * every row (status/label/assignee names need organization data), but structure
 * errors are surfaced before the request so users can fix the file.
 */
export function buildIssueCsvPreview(text: string): IssueCsvPreview {
	const matrix = parseCsvText(text);
	const header = matrix[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
	if (header.length === 0 || header.every((cell) => cell === "")) {
		return {
			headers: [],
			rows: [],
			previewRows: [],
			errors: [{ row: 0, code: "missingHeader" }],
			fatal: true,
		};
	}
	const columnIndex = new Map<string, number>();
	header.forEach((name, index) => {
		if (name && !columnIndex.has(name)) {
			columnIndex.set(name, index);
		}
	});
	if (!columnIndex.has("title")) {
		return {
			headers: header,
			rows: [],
			previewRows: [],
			errors: [{ row: 0, code: "missingTitleColumn" }],
			fatal: true,
		};
	}

	const dataRows = matrix
		.slice(1)
		.filter((row) => row.some((cell) => cell.trim() !== ""));
	if (dataRows.length === 0) {
		return {
			headers: header,
			rows: [],
			previewRows: [],
			errors: [{ row: 0, code: "empty" }],
			fatal: true,
		};
	}

	const rows: IssueImportRow[] = [];
	const errors: IssueCsvRowError[] = [];
	dataRows.forEach((source, index) => {
		const row: IssueImportRow = {};
		for (const column of ISSUE_CSV_COLUMNS) {
			const at = columnIndex.get(column);
			row[column] = at === undefined ? "" : (source[at] ?? "");
		}
		rows.push(row);
		const rowNumber = index + 1;
		const title = row.title.trim();
		if (!title) {
			errors.push({ row: rowNumber, code: "titleRequired" });
		} else if (title.length > 500) {
			errors.push({ row: rowNumber, code: "titleTooLong" });
		}
		if (row.description.length > 20000) {
			errors.push({ row: rowNumber, code: "descriptionTooLong" });
		}
		const priority = row.priority.trim().toLowerCase();
		if (
			priority &&
			!PRIORITY_NAMES.has(priority) &&
			!(/^\d+$/.test(priority) && Number(priority) <= 4)
		) {
			errors.push({
				row: rowNumber,
				code: "priorityInvalid",
				value: row.priority,
			});
		}
		const estimate = row.estimate.trim();
		if (estimate && (!/^\d+$/.test(estimate) || Number(estimate) > 100)) {
			errors.push({
				row: rowNumber,
				code: "estimateInvalid",
				value: row.estimate,
			});
		}
		const dueDate = row.due_date.trim();
		if (dueDate && !isDateValue(dueDate)) {
			errors.push({
				row: rowNumber,
				code: "dueDateInvalid",
				value: row.due_date,
			});
		}
	});

	const tooMany = rows.length > ISSUE_CSV_MAX_IMPORT_ROWS;
	return {
		headers: header,
		rows,
		previewRows: rows.slice(0, ISSUE_CSV_PREVIEW_ROWS),
		errors: tooMany ? [{ row: 0, code: "tooManyRows" }, ...errors] : errors,
		fatal: tooMany,
	};
}
