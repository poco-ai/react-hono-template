import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
	applyOptimisticPatches,
	optimisticPatch,
	rollbackOptimisticPatches,
} from "../src/lib/optimistic";

test("a patch snapshots the previous value and rollback restores it", async () => {
	const client = new QueryClient();
	const key = ["optimistic-test"];
	client.setQueryData(key, { count: 1 });

	const snapshots = await applyOptimisticPatches(client, [
		optimisticPatch<{ count: number }>(key, (old) => ({
			count: (old?.count ?? 0) + 1,
		})),
	]);
	assert.deepEqual(client.getQueryData(key), { count: 2 });

	rollbackOptimisticPatches(client, snapshots);
	assert.deepEqual(client.getQueryData(key), { count: 1 });
});

test("rollback leaves a key that was not cached untouched", async () => {
	const client = new QueryClient();
	const key = ["optimistic-empty"];

	const snapshots = await applyOptimisticPatches(client, [
		optimisticPatch<number[]>(key, (old) => [...(old ?? []), 1]),
	]);
	assert.deepEqual(client.getQueryData(key), [1]);

	rollbackOptimisticPatches(client, snapshots);
	assert.deepEqual(client.getQueryData(key), [1]);
});
