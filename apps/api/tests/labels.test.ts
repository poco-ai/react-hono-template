import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { LabelDao } from "../src/dao/label.dao";
import type { LabelDto } from "../src/dto/label.dto";
import type {
	CacheGetOptions,
	CacheSetOptions,
	CacheStore,
} from "../src/lib/kv/types";
import {
	createLabelService,
	labelsCacheKey,
} from "../src/services/label.service";

const labelDto = (id: string, name: string): LabelDto => ({
	id,
	orgId: "org",
	name,
	color: "#112233",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

const createFakeCache = (initial: Record<string, unknown> = {}) => {
	const entries = new Map<string, unknown>(Object.entries(initial));
	const calls = {
		gets: [] as { key: string; cacheTtl?: number }[],
		sets: [] as { key: string; value: unknown; ttlSeconds?: number }[],
		deletes: [] as string[],
	};
	const store: CacheStore = {
		get: async <T>(key: string, options?: CacheGetOptions) => {
			calls.gets.push({ key, cacheTtl: options?.cacheTtl });
			return (entries.get(key) as T | undefined) ?? null;
		},
		set: async <T>(key: string, value: T, options?: CacheSetOptions) => {
			calls.sets.push({ key, value, ttlSeconds: options?.ttlSeconds });
			entries.set(key, value);
			return true;
		},
		delete: async (key: string) => {
			calls.deletes.push(key);
			return entries.delete(key);
		},
	};
	return { store, calls };
};

const serviceFor = ({
	byId = null as LabelDto | null,
	byName = null as LabelDto | null,
	listed = [] as LabelDto[],
	created = labelDto("created", "New"),
	updated = null as LabelDto | null,
	references = 0,
	createError = null as Error | null,
	cache = createFakeCache(),
} = {}) => {
	const calls = {
		list: 0,
		created: [] as { id: string; orgId: string; name: string; color: string }[],
		updated: [] as Record<string, unknown>[],
	};
	const service = createLabelService(
		{
			listByOrg: async () => {
				calls.list += 1;
				return listed;
			},
			findById: async () => byId,
			findByName: async () => byName,
			create: async (data: {
				id: string;
				orgId: string;
				name: string;
				color: string;
			}) => {
				if (createError) throw createError;
				calls.created.push(data);
				return created;
			},
			update: async (
				_orgId: string,
				_id: string,
				patch: Record<string, unknown>,
			) => {
				calls.updated.push(patch);
				return updated;
			},
			delete: async () => true,
			countIssueReferences: async () => references,
		} as unknown as LabelDao,
		cache.store,
	);
	return { service, calls, cache };
};

const isLabelError = (status: number, code: ApiErrorCode) => (error: unknown) =>
	error instanceof ApiError && error.status === status && error.code === code;

test("listLabels delegates to the dao", async () => {
	const own = labelDto("label-1", "Bug");
	const { service } = serviceFor({ listed: [own] });
	assert.deepEqual(await service.listLabels("org"), [own]);
});

test("createLabel rejects duplicate names before writing", async () => {
	const { service, calls } = serviceFor({
		byName: labelDto("existing", "Bug"),
	});
	await assert.rejects(
		service.createLabel("org", { name: "Bug", color: "#112233" }),
		isLabelError(409, ApiErrorCode.LABEL_NAME_TAKEN),
	);
	assert.equal(calls.created.length, 0);
});

test("createLabel maps a unique-constraint race to the same 409", async () => {
	const race = serviceFor({
		createError: new Error(
			"UNIQUE constraint failed: labels.org_id, labels.name",
		),
	});
	await assert.rejects(
		race.service.createLabel("org", { name: "Bug", color: "#112233" }),
		isLabelError(409, ApiErrorCode.LABEL_NAME_TAKEN),
	);

	const unrelated = serviceFor({ createError: new Error("connection reset") });
	await assert.rejects(
		unrelated.service.createLabel("org", { name: "Bug", color: "#112233" }),
		/connection reset/,
	);
});

test("createLabel stores the caller's organization and input", async () => {
	const { service, calls } = serviceFor();
	const created = await service.createLabel("org", {
		name: "Bug",
		color: "#112233",
	});
	assert.equal(created.name, "New");
	assert.equal(calls.created.length, 1);
	const data = calls.created[0];
	assert.ok(data);
	assert.ok(typeof data.id === "string" && data.id.length > 0);
	assert.equal(data.orgId, "org");
	assert.equal(data.name, "Bug");
	assert.equal(data.color, "#112233");
});

test("updateLabel rejects unknown labels and other owners' names", async () => {
	const missing = serviceFor();
	await assert.rejects(
		missing.service.updateLabel("org", "label-1", { name: "Bug" }),
		isLabelError(404, ApiErrorCode.LABEL_NOT_FOUND),
	);

	const conflict = serviceFor({
		byId: labelDto("label-1", "Bug"),
		byName: labelDto("label-2", "Feature"),
	});
	await assert.rejects(
		conflict.service.updateLabel("org", "label-1", { name: "Feature" }),
		isLabelError(409, ApiErrorCode.LABEL_NAME_TAKEN),
	);
});

test("updateLabel allows keeping its own name and reports lost writes", async () => {
	const own = labelDto("label-1", "Bug");
	const keep = serviceFor({
		byId: own,
		byName: own,
		updated: labelDto("label-1", "Bug"),
	});
	assert.equal(
		(await keep.service.updateLabel("org", "label-1", { name: "Bug" })).id,
		"label-1",
	);

	const lost = serviceFor({ byId: own, updated: null });
	await assert.rejects(
		lost.service.updateLabel("org", "label-1", { color: "#445566" }),
		isLabelError(404, ApiErrorCode.LABEL_NOT_FOUND),
	);
});

test("deleteLabel refuses unknown or still-referenced labels", async () => {
	const missing = serviceFor();
	await assert.rejects(
		missing.service.deleteLabel("org", "label-1"),
		isLabelError(404, ApiErrorCode.LABEL_NOT_FOUND),
	);

	const inUse = serviceFor({
		byId: labelDto("label-1", "Bug"),
		references: 3,
	});
	await assert.rejects(
		inUse.service.deleteLabel("org", "label-1"),
		isLabelError(409, ApiErrorCode.LABEL_IN_USE),
	);

	const unused = serviceFor({ byId: labelDto("label-1", "Bug") });
	await unused.service.deleteLabel("org", "label-1");
});

test("listLabels serves a cached list without hitting the dao", async () => {
	const own = labelDto("label-1", "Bug");
	const cache = createFakeCache({ [labelsCacheKey("org")]: [own] });
	const { service, calls } = serviceFor({ cache });
	assert.deepEqual(await service.listLabels("org"), [own]);
	assert.equal(calls.list, 0);
	assert.deepEqual(cache.calls.gets, [
		{ key: "cache:v1:labels:org", cacheTtl: 30 },
	]);
	assert.equal(cache.calls.sets.length, 0);
});

test("listLabels caches a dao result under the encoded org key for 300s", async () => {
	const own = labelDto("label-1", "Bug");
	const { service, calls, cache } = serviceFor({ listed: [own] });
	assert.deepEqual(await service.listLabels("org/one"), [own]);
	assert.equal(calls.list, 1);
	assert.deepEqual(cache.calls.sets, [
		{
			key: "cache:v1:labels:org%2Fone",
			value: [own],
			ttlSeconds: 300,
		},
	]);
});

test("listLabels treats a cached empty array as a hit", async () => {
	const cache = createFakeCache({ [labelsCacheKey("org")]: [] });
	const { service, calls } = serviceFor({
		cache,
		listed: [labelDto("label-1", "Bug")],
	});
	assert.deepEqual(await service.listLabels("org"), []);
	assert.equal(calls.list, 0);
});

test("label writes invalidate the org-scoped list cache", async () => {
	const key = labelsCacheKey("org");

	const created = serviceFor();
	await created.service.createLabel("org", { name: "Bug", color: "#112233" });
	assert.deepEqual(created.cache.calls.deletes, [key]);

	const updated = serviceFor({
		byId: labelDto("label-1", "Bug"),
		updated: labelDto("label-1", "Bugfix"),
	});
	await updated.service.updateLabel("org", "label-1", { name: "Bugfix" });
	assert.deepEqual(updated.cache.calls.deletes, [key]);

	const deleted = serviceFor({ byId: labelDto("label-1", "Bug") });
	await deleted.service.deleteLabel("org", "label-1");
	assert.deepEqual(deleted.cache.calls.deletes, [key]);
});

test("failed label writes leave the list cache untouched", async () => {
	const duplicate = serviceFor({ byName: labelDto("existing", "Bug") });
	await assert.rejects(
		duplicate.service.createLabel("org", { name: "Bug", color: "#112233" }),
		isLabelError(409, ApiErrorCode.LABEL_NAME_TAKEN),
	);
	assert.deepEqual(duplicate.cache.calls.deletes, []);

	const lost = serviceFor({ byId: labelDto("label-1", "Bug"), updated: null });
	await assert.rejects(
		lost.service.updateLabel("org", "label-1", { color: "#445566" }),
		isLabelError(404, ApiErrorCode.LABEL_NOT_FOUND),
	);
	assert.deepEqual(lost.cache.calls.deletes, []);

	const inUse = serviceFor({
		byId: labelDto("label-1", "Bug"),
		references: 1,
	});
	await assert.rejects(
		inUse.service.deleteLabel("org", "label-1"),
		isLabelError(409, ApiErrorCode.LABEL_IN_USE),
	);
	assert.deepEqual(inUse.cache.calls.deletes, []);
});
