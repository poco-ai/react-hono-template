import assert from "node:assert/strict";
import { test } from "node:test";
import { projectsSearchSchema } from "../src/features/projects/search";

test("archived search params never coerce the string false to true", () => {
	assert.equal(
		projectsSearchSchema.parse({ archived: "false" }).archived,
		false,
	);
	assert.equal(projectsSearchSchema.parse({ archived: "0" }).archived, false);
	assert.equal(projectsSearchSchema.parse({ archived: "true" }).archived, true);
	assert.equal(projectsSearchSchema.parse({ archived: "1" }).archived, true);
	assert.equal(projectsSearchSchema.parse({ archived: true }).archived, true);
	assert.equal(projectsSearchSchema.parse({}).archived, undefined);
});
