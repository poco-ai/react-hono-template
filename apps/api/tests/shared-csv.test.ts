import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeCsvCell, unescapeCsvCell } from "@workspace/shared";

test("CSV escaping handles long runs of literal apostrophes", () => {
	const apostrophes = "'".repeat(50_000);
	const guarded = `${apostrophes}+1`;
	const plain = `${apostrophes}word`;

	assert.equal(escapeCsvCell(guarded), `'${guarded}`);
	assert.equal(unescapeCsvCell(`'${guarded}`), guarded);
	assert.equal(escapeCsvCell(plain), plain);
	assert.equal(unescapeCsvCell(plain), plain);
});
