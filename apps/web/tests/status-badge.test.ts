import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGACY_STATUS_META } from "../src/features/issues/components/status-badge";

test("legacy status metadata matches the seeded workflow defaults", () => {
	assert.deepEqual(LEGACY_STATUS_META, {
		backlog: { category: "backlog", color: "#64748b" },
		todo: { category: "unstarted", color: "#3b82f6" },
		in_progress: { category: "started", color: "#f59e0b" },
		in_review: { category: "started", color: "#a855f7" },
		done: { category: "completed", color: "#22c55e" },
		canceled: { category: "canceled", color: "#94a3b8" },
	});
});
