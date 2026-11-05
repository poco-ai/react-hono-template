import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { issueTemplatesKey, issueTemplatesRootKey } from "../src/features/keys";
import {
	applyIssueTemplate,
	emptyIssueTemplateForm,
	issueTemplateFormFromDto,
	ORG_WIDE_TEMPLATE_SCOPE,
	TEMPLATE_NO_STATUS,
	templateInputFromForm,
	templatesForProject,
} from "../src/features/templates/apply";
import type { IssueTemplateDto } from "../src/features/templates/data";
import {
	createIssueTemplate,
	deleteIssueTemplate,
	invalidateIssueTemplateQueries,
	updateIssueTemplate,
} from "../src/features/templates/data";

interface RequestRecord {
	url: URL;
	method: string;
	body: unknown;
}

async function withRequests(
	respond: () => Response,
	run: (requests: RequestRecord[]) => Promise<void>,
) {
	const original = globalThis.fetch;
	const requests: RequestRecord[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(
				input instanceof Request ? input.url : String(input),
				"http://localhost",
			);
			const body =
				typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
			requests.push({ url, method: init?.method ?? "GET", body });
			return respond();
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		await run(requests);
	} finally {
		globalThis.fetch = original;
	}
}

const template = (
	overrides: Partial<IssueTemplateDto> = {},
): IssueTemplateDto => ({
	id: "template-1",
	orgId: "org",
	projectId: "project-1",
	name: "Bug report",
	title: "Something is broken",
	description: "Steps to reproduce",
	statusId: "status-todo",
	priority: 2,
	labelIds: ["label-1", "label-2"],
	estimate: 3,
	createdById: "user-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const form = {
	title: "",
	description: "",
	statusId: "status-default",
	priority: "none" as const,
	labelIds: [] as string[],
	dueDate: "",
	estimate: "",
};

test("applying a template overrides prefill fields and keeps the form editable", () => {
	const next = applyIssueTemplate(form, template());
	assert.deepEqual(next, {
		...form,
		title: "Something is broken",
		description: "Steps to reproduce",
		statusId: "status-todo",
		priority: "high",
		labelIds: ["label-1", "label-2"],
		estimate: "3",
	});
	// The original state is not mutated.
	assert.equal(form.title, "");
});

test("a template without status keeps the project default status", () => {
	const next = applyIssueTemplate(
		{ ...form, statusId: "status-default" },
		template({ statusId: null, priority: null, estimate: null, labelIds: [] }),
	);
	assert.equal(next.statusId, "status-default");
	assert.equal(next.priority, "none");
	assert.equal(next.estimate, "");
	assert.deepEqual(next.labelIds, []);
});

test("labels deleted after the template was saved are dropped", () => {
	const next = applyIssueTemplate(form, template(), {
		availableLabelIds: ["label-2", "label-3"],
	});
	assert.deepEqual(next.labelIds, ["label-2"]);
});

test("project templates are listed before organization-wide ones", () => {
	const templates = [
		template({ id: "org-b", projectId: null, name: "B" }),
		template({ id: "other", projectId: "project-2", name: "A" }),
		template({ id: "project-c", projectId: "project-1", name: "C" }),
		template({ id: "org-a", projectId: null, name: "A" }),
	];
	assert.deepEqual(
		templatesForProject(templates, "project-1").map((item) => item.id),
		["project-c", "org-a", "org-b"],
	);
	assert.deepEqual(
		templatesForProject(templates, "project-3").map((item) => item.id),
		["org-a", "org-b"],
	);
	assert.deepEqual(templatesForProject(undefined, "project-1"), []);
});

test("template form round-trips through the DTO and serializes nulls explicitly", () => {
	const dto = template({
		projectId: null,
		statusId: null,
		description: null,
		estimate: null,
	});
	const form = issueTemplateFormFromDto(dto);
	assert.equal(form.projectId, ORG_WIDE_TEMPLATE_SCOPE);
	assert.equal(form.statusId, TEMPLATE_NO_STATUS);
	assert.equal(form.priority, "high");

	assert.deepEqual(templateInputFromForm(form), {
		name: "Bug report",
		projectId: null,
		title: "Something is broken",
		description: null,
		statusId: null,
		priority: 2,
		labelIds: ["label-1", "label-2"],
		estimate: null,
	});

	const empty = templateInputFromForm(emptyIssueTemplateForm());
	assert.deepEqual(empty.projectId, null);
	assert.deepEqual(empty.statusId, null);
	assert.equal(empty.description, null);
	assert.equal(empty.estimate, null);
});

test("template keys nest under the org root and per project filter", () => {
	assert.deepEqual(issueTemplatesRootKey("org"), [
		"orgs",
		"org",
		"issueTemplates",
	]);
	assert.deepEqual(issueTemplatesKey("org"), [
		"orgs",
		"org",
		"issueTemplates",
		{ projectId: null },
	]);
	assert.deepEqual(issueTemplatesKey("org", { projectId: "p1" }), [
		"orgs",
		"org",
		"issueTemplates",
		{ projectId: "p1" },
	]);
});

test("template requests hit the org-scoped endpoints", async () => {
	const input = templateInputFromForm(emptyIssueTemplateForm());
	await withRequests(
		() => Response.json({ ok: true, data: template() }),
		async (requests) => {
			await createIssueTemplate("org", { ...input, name: "One", title: "T" });
			await updateIssueTemplate("org", "template-1", { name: "Two" });
			await deleteIssueTemplate("org", "template-1");
			assert.deepEqual(
				requests.map(({ method, url }) => `${method} ${url.pathname}`),
				[
					"POST /api/orgs/org/issue-templates",
					"PATCH /api/orgs/org/issue-templates/template-1",
					"DELETE /api/orgs/org/issue-templates/template-1",
				],
			);
			const createBody = requests[0]?.body as { name?: string } | undefined;
			assert.equal(createBody?.name, "One", "the create payload is forwarded");
		},
	);
});

test("template writes invalidate the template list but not issue caches", async () => {
	const client = new QueryClient();
	const templateKeys = [
		issueTemplatesKey("org"),
		issueTemplatesKey("org", { projectId: "p1" }),
	];
	const untouched = [
		["orgs", "other", "issueTemplates"],
		["orgs", "org", "issues"],
		["orgs", "org", "activities"],
	];
	for (const key of [...templateKeys, ...untouched]) {
		client.setQueryData(key, {});
	}
	await invalidateIssueTemplateQueries(client, "org");
	for (const key of templateKeys) {
		assert.equal(client.getQueryState(key)?.isInvalidated, true);
	}
	for (const key of untouched) {
		assert.equal(
			client.getQueryState(key)?.isInvalidated,
			false,
			JSON.stringify(key),
		);
	}
});
