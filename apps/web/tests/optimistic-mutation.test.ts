import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
	applyOptimisticPatches,
	normalizeOptimisticPatches,
	optimisticPatch,
	rollbackOptimisticPatches,
} from "../src/lib/optimistic";

test("multi-key patches snapshot every key and roll back all of them", async () => {
	const client = new QueryClient();
	const listKey = ["optimistic-list"];
	const countKey = ["optimistic-count"];
	client.setQueryData(listKey, ["a", "b"]);
	client.setQueryData(countKey, { unread: 2 });

	const snapshots = await applyOptimisticPatches(client, [
		optimisticPatch<string[]>(listKey, (old) =>
			old?.filter((id) => id !== "a"),
		),
		optimisticPatch<{ unread: number }>(countKey, (old) => ({
			unread: Math.max(0, (old?.unread ?? 0) - 1),
		})),
	]);
	assert.deepEqual(client.getQueryData(listKey), ["b"]);
	assert.deepEqual(client.getQueryData(countKey), { unread: 1 });
	assert.equal(snapshots.length, 2);

	rollbackOptimisticPatches(client, snapshots);
	assert.deepEqual(client.getQueryData(listKey), ["a", "b"]);
	assert.deepEqual(client.getQueryData(countKey), { unread: 2 });
});

test("patches on the same key merge in order and still roll back to the original", async () => {
	const client = new QueryClient();
	const key = ["optimistic-merge"];
	client.setQueryData(key, { seen: [] as string[] });

	const snapshots = await applyOptimisticPatches(client, [
		optimisticPatch<{ seen: string[] }>(key, (old) => ({
			seen: [...(old?.seen ?? []), "first"],
		})),
		optimisticPatch<{ seen: string[] }>(key, (old) => ({
			seen: [...(old?.seen ?? []), "second"],
		})),
	]);
	// Snapshotting happens before the first write, so the second patch sees the
	// first one's value and rollback still restores the pre-mutation cache.
	assert.deepEqual(client.getQueryData(key), { seen: ["first", "second"] });

	rollbackOptimisticPatches(client, snapshots);
	assert.deepEqual(client.getQueryData(key), { seen: [] });
});

test("normalizeOptimisticPatches accepts a single patch or a list", () => {
	const patch = optimisticPatch<number>(["optimistic-single"], (old) => old);
	assert.deepEqual(normalizeOptimisticPatches(patch), [patch]);
	assert.deepEqual(normalizeOptimisticPatches([patch, patch]), [patch, patch]);
});

test("rollback tolerates a missing onMutate result", () => {
	const client = new QueryClient();
	const key = ["optimistic-missing"];
	client.setQueryData(key, { kept: true });

	rollbackOptimisticPatches(client, undefined);
	assert.deepEqual(client.getQueryData(key), { kept: true });
});
