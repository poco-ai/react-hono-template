import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { LabelDao } from "../src/dao/label.dao";
import type { LabelDto } from "../src/dto/label.dto";
import { createLabelService } from "../src/services/label.service";

const labelDto = (id: string, name: string): LabelDto => ({
	id,
	orgId: "org",
	name,
	color: "#112233",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

const serviceFor = ({
	byId = null as LabelDto | null,
	byName = null as LabelDto | null,
	listed = [] as LabelDto[],
	created = labelDto("created", "New"),
	updated = null as LabelDto | null,
	references = 0,
	createError = null as Error | null,
} = {}) => {
	const calls = {
		created: [] as { id: string; orgId: string; name: string; color: string }[],
		updated: [] as Record<string, unknown>[],
	};
	const service = createLabelService({
		listByOrg: async () => listed,
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
	} as unknown as LabelDao);
	return { service, calls };
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
