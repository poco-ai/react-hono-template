import assert from "node:assert/strict";
import { test } from "node:test";
import { ISSUE_CSV_MAX_IMPORT_ROWS } from "@workspace/shared";
import {
	buildIssueCsvPreview,
	ISSUE_CSV_MAX_FILE_BYTES,
} from "../src/features/issues/csv";
import {
	exportProjectIssues,
	issueExportUrl,
} from "../src/features/issues/data";

test("csv preview maps headers case-insensitively and ignores export-only columns", () => {
	const preview = buildIssueCsvPreview(
		[
			"Key,Project,Title,Description,Status,Priority,Assignee,Labels,Due_Date,Estimate,Cycle,Created_At",
			'WEB-1,Web,"Fix ""login"", now","line one\nline two",In Progress,High,Alice,"Bug, Frontend",2026-05-01,3,Sprint 1,2026-01-01',
		].join("\r\n"),
	);
	assert.equal(preview.fatal, false);
	assert.deepEqual(preview.errors, []);
	assert.equal(preview.rows.length, 1);
	assert.deepEqual(preview.rows[0], {
		title: 'Fix "login", now',
		description: "line one\nline two",
		status: "In Progress",
		priority: "High",
		assignee: "Alice",
		labels: "Bug, Frontend",
		due_date: "2026-05-01",
		estimate: "3",
		cycle: "Sprint 1",
	});
	assert.deepEqual(preview.previewRows, preview.rows);
});

test("csv preview skips blank rows and reports structural row errors", () => {
	const preview = buildIssueCsvPreview(
		[
			"title,priority,estimate,due_date",
			"",
			"Good,none,5,2026-01-01",
			",urgent,0,",
			"Bad priority,nope,4,2026-01-01",
			"Bad estimate,none,101,2026-01-01",
			"Bad date,none,1,not-a-date",
		].join("\n"),
	);
	assert.equal(preview.rows.length, 5);
	assert.deepEqual(
		preview.errors.map((error) => `${error.row}:${error.code}`),
		[
			"2:titleRequired",
			"3:priorityInvalid",
			"4:estimateInvalid",
			"5:dueDateInvalid",
		],
	);
	assert.equal(preview.fatal, false);
});

test("csv preview blocks files without a title column, empty files and oversized row counts", () => {
	const missing = buildIssueCsvPreview("key,project,status\nWEB-1,Web,Done");
	assert.equal(missing.fatal, true);
	assert.deepEqual(
		missing.errors.map((error) => error.code),
		["missingTitleColumn"],
	);

	const empty = buildIssueCsvPreview("title,status\n\n");
	assert.equal(empty.fatal, true);
	assert.deepEqual(
		empty.errors.map((error) => error.code),
		["empty"],
	);

	const tooMany = buildIssueCsvPreview(
		[
			"title",
			...Array.from({ length: ISSUE_CSV_MAX_IMPORT_ROWS + 1 }, (_, i) =>
				i === 0 ? "First" : `Row ${i}`,
			),
		].join("\n"),
	);
	assert.equal(tooMany.fatal, true);
	assert.equal(tooMany.errors[0].code, "tooManyRows");
	assert.equal(ISSUE_CSV_MAX_FILE_BYTES, 1024 * 1024);
});

test("csv preview shows only the first five rows", () => {
	const preview = buildIssueCsvPreview(
		["title", ...Array.from({ length: 8 }, (_, i) => `Row ${i + 1}`)].join(
			"\n",
		),
	);
	assert.equal(preview.rows.length, 8);
	assert.equal(preview.previewRows.length, 5);
	assert.equal(preview.fatal, false);
});

test("export request downloads a blob and reads truncation headers", async () => {
	const original = globalThis.fetch;
	let requested: string | undefined;
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL) => {
			requested = String(input);
			return new Response("key,title\r\nWEB-1,Hello", {
				status: 200,
				headers: {
					"Content-Type": "text/csv; charset=utf-8",
					"Content-Disposition": 'attachment; filename="WEB-issues.csv"',
					"X-Issue-Truncated": "true",
					"X-Issue-Total": "2500",
				},
			});
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		const result = await exportProjectIssues("org", "p 1");
		assert.equal(requested, `${issueExportUrl("org", "p 1")}`);
		assert.match(requested ?? "", /\/projects\/p%201\/issues\/export\.csv$/);
		assert.equal(result.filename, "WEB-issues.csv");
		assert.equal(result.truncated, true);
		assert.equal(result.total, 2500);
		assert.match(await result.blob.text(), /WEB-1,Hello/);
	} finally {
		globalThis.fetch = original;
	}
});
