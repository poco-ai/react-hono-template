/** Splits a comma-separated value into trimmed, non-empty entries. */
export function parseCsv(value: string | null | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

/**
 * RFC 4180 parser for full CSV documents. Supports quoted fields, escaped
 * double quotes (`""`), CRLF/LF line endings and a leading BOM. Blank trailing
 * lines are dropped. Malformed input (e.g. an unterminated quote) is tolerated
 * by consuming the remainder of the document as the current field instead of
 * throwing, so imports surface row-level errors instead of a stack trace.
 */
export function parseCsvText(text: string): string[][] {
	const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	const pushField = () => {
		row.push(field);
		field = "";
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
	};

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (inQuotes) {
			if (char === '"') {
				if (source[index + 1] === '"') {
					field += '"';
					index++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"' && field === "") {
			inQuotes = true;
		} else if (char === ",") {
			pushField();
		} else if (char === "\n") {
			pushRow();
		} else if (char === "\r") {
			if (source[index + 1] === "\n") {
				index++;
			}
			pushRow();
		} else {
			field += char;
		}
	}
	if (inQuotes) {
		// Unterminated quote: keep what was read so the caller can report the
		// row instead of losing the whole document.
	}
	if (field !== "" || row.length > 0) {
		pushRow();
	}
	// Blank trailing lines (`\n\n`, `\r\n\r\n`) are ignored.
	while (rows.length > 0) {
		const last = rows[rows.length - 1];
		if (last.length === 1 && last[0] === "") {
			rows.pop();
		} else {
			break;
		}
	}
	return rows;
}

/**
 * Characters that make spreadsheet apps (Excel, Sheets, LibreOffice) treat a
 * cell as a formula or a control sequence. A leading TAB/CR can also hide the
 * real payload, so they are escaped as well.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** True when a cell value would be interpreted as a formula by a spreadsheet. */
export const isFormulaLike = (value: string): boolean =>
	FORMULA_LEAD.test(value);

/**
 * True when a value must carry the safety quote: either it is formula-like, or
 * it is a literal leading apostrophe followed by one (which `unescapeCsvCell`
 * would otherwise strip). Normal text such as `'tis the season` is not quoted.
 */
const needsCsvQuote = (value: string): boolean =>
	isFormulaLike(value) ||
	(value.startsWith("'") && needsCsvQuote(value.slice(1)));

/**
 * Neutralizes formula injection (CSV injection) by prefixing a single quote,
 * which spreadsheet apps strip but never evaluate. Plain text is untouched.
 */
export const escapeCsvCell = (value: string): string =>
	needsCsvQuote(value) ? `'${value}` : value;

/**
 * Reverses `escapeCsvCell` for imported rows. Only strips the quote when the
 * remaining value would have been escaped, so a genuine leading apostrophe
 * (e.g. `'tis the season`) survives a round-trip unchanged.
 */
export const unescapeCsvCell = (value: string): string =>
	value.startsWith("'") && needsCsvQuote(value.slice(1))
		? value.slice(1)
		: value;

/** Quotes a field only when RFC 4180 requires it. */
const escapeField = (value: string): string =>
	/["\r\n,]/.test(value) || /^\s|\s$/.test(value)
		? `"${value.replaceAll('"', '""')}"`
		: value;

/**
 * Serializes a matrix to CSV (CRLF line endings, per RFC 4180). Quotes and
 * escapes fields containing commas, quotes or line breaks, and neutralizes
 * formula-like cells (leading `=`, `+`, `-`, `@`, TAB or CR) so opening the
 * export in a spreadsheet cannot execute issue content.
 */
export function serializeCsvText(rows: readonly (readonly string[])[]): string {
	return rows
		.map((row) =>
			row
				.map((value) => escapeField(escapeCsvCell(String(value ?? ""))))
				.join(","),
		)
		.join("\r\n");
}

/**
 * Issue CSV column contract.
 *
 * Export adds `key`/`project` before the shared columns and timestamps after
 * them; import ignores `key` and `project` (an imported issue always belongs
 * to the project in the URL).
 */
export const ISSUE_CSV_COLUMNS = [
	"title",
	"description",
	"status",
	"priority",
	"assignee",
	"labels",
	"due_date",
	"estimate",
	"cycle",
] as const;

export const ISSUE_CSV_EXPORT_COLUMNS = [
	"key",
	"project",
	...ISSUE_CSV_COLUMNS,
	"created_at",
	"updated_at",
] as const;

/** Header row used by `GET .../issues/export.csv`. */
export const ISSUE_CSV_EXPORT_HEADERS: readonly string[] =
	ISSUE_CSV_EXPORT_COLUMNS;

/** Hard import limit: rows per request (the UI enforces it before uploading). */
export const ISSUE_CSV_MAX_IMPORT_ROWS = 100;

/** Hard export cap; larger projects are truncated with a response header. */
export const ISSUE_CSV_MAX_EXPORT_ROWS = 2000;
