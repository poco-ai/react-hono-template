import assert from "node:assert/strict";
import { test } from "node:test";
import {
	resolveContentType,
	uploadAttachment,
} from "../src/features/attachments/data";
import { deleteAvatar, uploadAvatar } from "../src/features/auth/data";
import { inviteMember } from "../src/features/members/data";
import { uploadOrganizationLogo } from "../src/features/organizations/data";
import { createProject, updateProject } from "../src/features/projects/data";
import { saveWebhook } from "../src/features/webhooks/data";

interface RequestRecord {
	url: URL;
	method: string;
	body: unknown;
	signal: AbortSignal | null | undefined;
}

async function withRequests(
	respond: (request: RequestRecord) => Response,
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
			const request = {
				url,
				method: init?.method ?? "GET",
				body,
				signal: init?.signal,
			};
			requests.push(request);
			return respond(request);
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		await run(requests);
	} finally {
		globalThis.fetch = original;
	}
}

const ok = (data: unknown) => Response.json({ ok: true, data });

test("project requests use validated mutation variables and preserve nullable edits", () =>
	withRequests(
		() => ok({ id: "project" }),
		async (requests) => {
			await createProject("org", {
				name: "Project",
				key: "TEST",
				color: "#123456",
			});
			await updateProject("org", {
				projectId: "project",
				input: { name: "Renamed", description: null, color: "#abcdef" },
			});
			assert.equal(requests[0].url.pathname, "/api/orgs/org/projects");
			assert.equal(requests[0].method, "POST");
			assert.deepEqual(requests[0].body, {
				name: "Project",
				key: "TEST",
				color: "#123456",
			});
			assert.equal(requests[1].url.pathname, "/api/orgs/org/projects/project");
			assert.equal(requests[1].method, "PATCH");
			assert.deepEqual(requests[1].body, {
				name: "Renamed",
				description: null,
				color: "#abcdef",
			});
		},
	));

test("webhook creation retains one-time secrets and edits preserve activation state", () =>
	withRequests(
		(request) =>
			ok(
				request.method === "POST"
					? { id: "hook", secret: "test-secret" }
					: { id: "hook", active: false },
			),
		async (requests) => {
			const created = await saveWebhook("org", undefined, {
				url: "https://example.com/hook",
				events: ["issue.created"],
				active: false,
			});
			await saveWebhook("org", "hook", {
				url: "https://example.com/edited",
				events: ["issue.updated"],
				active: false,
			});
			assert.equal("secret" in created && created.secret, "test-secret");
			assert.deepEqual(requests[0].body, {
				url: "https://example.com/hook",
				events: ["issue.created"],
			});
			assert.equal(requests[1].method, "PATCH");
			assert.deepEqual(requests[1].body, {
				url: "https://example.com/edited",
				events: ["issue.updated"],
				active: false,
			});
		},
	));

test("attachment uploads pass the AbortSignal and only finalize after a successful PUT", () =>
	withRequests(
		(request) =>
			request.url.pathname.endsWith("/presign")
				? ok({ key: "object-key", uploadUrl: "https://storage.example/upload" })
				: request.method === "PUT"
					? new Response(null, { status: 200 })
					: ok({}),
		async (requests) => {
			const file = new File(["image"], "example.jpg", { type: "image/jpg" });
			const controller = new AbortController();
			await uploadAttachment("org", "project", 4, {
				file,
				signal: controller.signal,
			});
			assert.equal(resolveContentType(file), "image/jpeg");
			assert.equal(requests.length, 3);
			assert.deepEqual(requests[0].body, {
				filename: "example.jpg",
				contentType: "image/jpeg",
				size: file.size,
			});
			assert.equal(requests[1].method, "PUT");
			assert.equal(requests[1].body, file);
			assert.equal(requests[1].signal, controller.signal);
			assert.deepEqual(requests[2].body, {
				key: "object-key",
				filename: "example.jpg",
				contentType: "image/jpeg",
				size: file.size,
			});
		},
	));

test("failed attachment uploads never register a nonexistent attachment", () =>
	withRequests(
		(request) =>
			request.url.pathname.endsWith("/presign")
				? ok({ key: "object-key", uploadUrl: "https://storage.example/upload" })
				: new Response(null, { status: 500 }),
		async (requests) => {
			await assert.rejects(
				uploadAttachment("org", "project", 4, {
					file: new File(["text"], "note.txt"),
					signal: new AbortController().signal,
				}),
				/Upload failed/,
			);
			assert.equal(requests.length, 2);
		},
	));

test("avatar uploads presign, PUT, then register the returned media URL", () =>
	withRequests(
		(request) => {
			if (request.url.pathname.endsWith("/presign")) {
				return ok({
					key: "users/user/avatars/asset.webp",
					uploadUrl: "https://storage.example/avatar",
					expiresIn: 600,
				});
			}
			if (request.method === "PUT") return new Response(null, { status: 200 });
			return ok({
				assetId: "asset",
				url: "https://api.example.com/api/media/asset",
			});
		},
		async (requests) => {
			const file = new File(["image"], "avatar.webp", { type: "image/webp" });
			const url = await uploadAvatar(file);
			assert.equal(url, "https://api.example.com/api/media/asset");
			assert.equal(requests.length, 3);
			assert.equal(requests[0].url.pathname, "/api/me/avatar/presign");
			assert.deepEqual(requests[0].body, {
				filename: "avatar.webp",
				contentType: "image/webp",
				size: file.size,
			});
			assert.equal(requests[1].method, "PUT");
			assert.equal(requests[1].body, file);
			assert.deepEqual(requests[2].body, {
				key: "users/user/avatars/asset.webp",
			});
			await deleteAvatar(url);
			assert.equal(requests[3].method, "DELETE");
			assert.equal(requests[3].url.pathname, "/api/me/avatar");
			assert.deepEqual(requests[3].body, { url });
		},
	));

test("organization logo uploads use the active organization", () =>
	withRequests(
		(request) => {
			if (request.url.pathname.endsWith("/get-full-organization")) {
				return Response.json({ id: "org-1", name: "Acme", slug: "acme" });
			}
			if (request.url.pathname.endsWith("/presign")) {
				return ok({
					key: "orgs/org-1/logo/asset.webp",
					uploadUrl: "https://storage.example/logo",
					expiresIn: 600,
				});
			}
			if (request.method === "PUT") return new Response(null, { status: 200 });
			return ok({
				assetId: "logo",
				url: "https://api.example.com/api/media/logo",
			});
		},
		async (requests) => {
			const file = new File(["image"], "logo.webp", { type: "image/webp" });
			const url = await uploadOrganizationLogo(file);
			assert.equal(url, "https://api.example.com/api/media/logo");
			assert.equal(requests[1].url.pathname, "/api/orgs/org-1/logo/presign");
			assert.equal(requests[2].method, "PUT");
			assert.deepEqual(requests[3].body, {
				key: "orgs/org-1/logo/asset.webp",
			});
		},
	));

test("invitation failures retain plan-limit codes for translated quota feedback", () =>
	withRequests(
		() =>
			Response.json(
				{ code: "PLAN_LIMIT_EXCEEDED", message: "Quota reached" },
				{ status: 403 },
			),
		async () => {
			await assert.rejects(
				inviteMember("org", { email: "person@example.com", role: "member" }),
				(error: unknown) =>
					error instanceof Error &&
					"code" in error &&
					error.code === "PLAN_LIMIT_EXCEEDED",
			);
		},
	));
