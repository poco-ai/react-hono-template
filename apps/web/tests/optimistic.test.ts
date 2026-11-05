import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { optimisticUpdate, rollbackOptimistic } from "../src/lib/optimistic";

test("optimisticUpdate snapshots the previous value and rollback restores it", async () => {
	const client = new QueryClient();
	const key = ["optimistic-test"];
	client.setQueryData(key, { count: 1 });

	const context = await optimisticUpdate<{ count: number }>(
		client,
		key,
		(old) => ({ count: (old?.count ?? 0) + 1 }),
	);
	assert.deepEqual(client.getQueryData(key), { count: 2 });

	rollbackOptimistic(client, key, context);
	assert.deepEqual(client.getQueryData(key), { count: 1 });
});

test("rollbackOptimistic leaves an empty snapshot untouched", async () => {
	const client = new QueryClient();
	const key = ["optimistic-empty"];

	const context = await optimisticUpdate<number[]>(client, key, (old) => [
		...(old ?? []),
		1,
	]);
	assert.deepEqual(client.getQueryData(key), [1]);

	rollbackOptimistic(client, key, context);
	assert.deepEqual(client.getQueryData(key), [1]);
});
