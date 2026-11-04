import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	createMcpHandler,
	type McpHttpHandler,
} from "@modelcontextprotocol/server";
import { ApiError, ApiErrorCode, type ApiKeyScope } from "@workspace/shared";
import { z } from "zod";
import type {
	CapabilityEntry,
	CapabilityResult,
} from "../src/capabilities/types";
import type { ApiKeyDao } from "../src/dao/api-key.dao";
import type { Auth } from "../src/lib/auth";
import { sha256Hex } from "../src/lib/crypto";
import {
	type McpAuthResult,
	type McpPrincipal,
	normalizeOAuthScopes,
	resolveMcpAuth,
} from "../src/mcp/auth";
import { createMcpServerFactory } from "../src/mcp/server";
import type { McpToolRuntime } from "../src/mcp/tools";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const NOW = "2026-01-01T00:00:00.000Z";
const RESOURCE = "https://api.example.com/mcp";
const BASE_URL = "https://api.example.com/api/auth";

const readCapability = (
	name: string,
	input = z.object({}),
): CapabilityEntry => ({
	name,
	titleKey: `ai.capabilities.${name}.title`,
	description: `${name} description`,
	input,
	effect: "read",
	scopes: ["read"],
	execute: async () => ({ data: {}, summary: `${name} ran.`, links: [] }),
});

const writeCapability = (
	name: string,
	input = z.object({}),
	options: {
		scopes?: readonly ApiKeyScope[];
		minOrgRole?: "owner" | "admin";
	} = {},
): CapabilityEntry => ({
	name,
	titleKey: `ai.capabilities.${name}.title`,
	description: `${name} description`,
	input,
	effect: "write",
	scopes: options.scopes ?? ["write"],
	minOrgRole: options.minOrgRole,
	execute: async () => ({ data: {}, summary: `${name} ran.`, links: [] }),
});

const issueKeyInput = z.object({
	issueId: z.string().min(1).optional(),
	projectKey: z.string().trim().min(1).optional(),
	number: z.number().int().min(1).optional(),
});

const capabilities: CapabilityEntry[] = [
	{
		...readCapability("list_orgs"),
		orgScoped: false,
	},
	readCapability("list_issues", z.object({ search: z.string().optional() })),
	readCapability("get_issue", issueKeyInput),
	readCapability("list_projects"),
	readCapability("get_project", z.object({ projectId: z.string().min(1) })),
	writeCapability("create_issue", z.object({ title: z.string().min(1) })),
	writeCapability(
		"create_project",
		z.object({ name: z.string().min(1), key: z.string().min(1) }),
		{ scopes: ["admin"], minOrgRole: "admin" },
	),
];

const issueData = {
	id: "issue-1",
	projectId: "project-1",
	number: 12,
	title: "Login fails",
	description: null,
	statusId: "status-todo",
	status: {
		id: "status-todo",
		name: "Todo",
		category: "unstarted",
		color: "#3b82f6",
		position: 1,
		isDefault: false,
	},
	statusName: "Todo",
	priority: 2,
	assigneeId: null,
	dueDate: null,
	estimate: null,
	parentId: null,
	labelIds: [],
	createdAt: NOW,
	updatedAt: NOW,
};

const projectData = {
	id: "project-1",
	name: "Website",
	key: "WEB",
	description: null,
	color: null,
	archived: false,
	nextNumber: 13,
	createdAt: NOW,
	updatedAt: NOW,
};

type LayerCall = {
	name: string;
	orgId?: string;
	input: unknown;
};

const createLayer = (
	overrides: Record<
		string,
		(ctx: { orgId?: string }) => Promise<CapabilityResult<unknown>>
	> = {},
) => {
	const calls: LayerCall[] = [];
	return {
		calls,
		execute: async <TData = unknown>(
			name: string,
			ctx: { orgId?: string },
			input: unknown,
		): Promise<CapabilityResult<TData>> => {
			calls.push({ name, orgId: ctx.orgId, input });
			const override = overrides[name];
			if (override) {
				return (await override(ctx)) as CapabilityResult<TData>;
			}
			switch (name) {
				case "get_issue":
					return {
						data: { issue: issueData },
						summary: "Issue #12: Login fails.",
						links: [],
					} as unknown as CapabilityResult<TData>;
				case "list_projects":
					return {
						data: { projects: [projectData] },
						summary: "Found 1 project(s).",
						links: [],
					} as unknown as CapabilityResult<TData>;
				case "get_project":
					return {
						data: { project: projectData },
						summary: "Project WEB: Website.",
						links: [],
					} as unknown as CapabilityResult<TData>;
				case "list_issues":
					return {
						data: { items: [], total: 0, page: 1, pageSize: 20 },
						summary: "Found 0 issue(s).",
						links: [],
					} as unknown as CapabilityResult<TData>;
				case "list_orgs":
					return {
						data: { orgs: [{ id: ORG_ID, name: "Acme", slug: "acme" }] },
						summary: "Found 1 organization(s).",
						links: [],
					} as unknown as CapabilityResult<TData>;
				case "create_issue":
					return {
						data: { issue: issueData },
						summary: "Created issue #12.",
						links: [],
					} as unknown as CapabilityResult<TData>;
				case "create_project":
					return {
						data: { project: projectData },
						summary: "Created project WEB.",
						links: [],
					} as unknown as CapabilityResult<TData>;
				default:
					throw new ApiError(
						404,
						ApiErrorCode.NOT_FOUND,
						`Unknown capability ${name}`,
					);
			}
		},
	};
};

type MemberState = {
	frozen: boolean;
	role: string;
	member: boolean;
	memberships: {
		id: string;
		name: string;
		slug: string;
		frozen: boolean;
		role: string;
	}[];
};

const createMemberDao = (state: MemberState) => ({
	findByOrgAndUser: async (orgId: string, userId: string) =>
		state.member
			? {
					id: "member-1",
					organizationId: orgId,
					userId,
					role: state.role,
					createdAt: new Date(NOW),
					updatedAt: new Date(NOW),
					frozen: state.frozen,
				}
			: undefined,
	isOrgFrozen: async () => state.frozen,
	listMembershipsByUser: async () => state.memberships,
});

const oauthPrincipal = (
	scopes: ApiKeyScope[] = ["read", "write", "admin"],
): McpPrincipal => ({
	method: "oauth",
	scopes,
	userId: USER_ID,
	authInfo: {
		token: "oauth-token",
		clientId: "client-1",
		scopes,
		extra: { authMethod: "oauth", userId: USER_ID, scopes },
	},
});

const runtimeFor = ({
	principal,
	layer,
	memberState,
}: {
	principal: McpPrincipal;
	layer: ReturnType<typeof createLayer>;
	memberState: MemberState;
}): McpToolRuntime => ({
	principal,
	capabilities,
	layer,
	memberDao: createMemberDao(memberState),
	appWebUrl: "https://app.example.com",
	locale: "en",
	background: (task) => {
		void task();
	},
});

const handlerFor = (runtime: McpToolRuntime): McpHttpHandler =>
	createMcpHandler(createMcpServerFactory(runtime), { legacy: "stateless" });

type JsonRpcMessage = {
	result?: {
		tools?: { name: string; annotations?: Record<string, unknown> }[];
		prompts?: { name: string }[];
		resourceTemplates?: { uriTemplate: string }[];
		contents?: { mimeType?: string; text?: string }[];
		messages?: { content?: { text?: string } }[];
		content?: { text?: string }[];
		structuredContent?: Record<string, unknown>;
		isError?: boolean;
	};
	error?: { code: number; message: string };
};

const rpc = async (
	handler: McpHttpHandler,
	body: unknown,
	authInfo?: McpPrincipal["authInfo"],
) => {
	const response = await handler.fetch(
		new Request(RESOURCE, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				"mcp-protocol-version": "2025-06-18",
			},
			body: JSON.stringify(body),
		}),
		authInfo ? { authInfo } : undefined,
	);
	const text = await response.text();
	const dataLine = text
		.split(/\r?\n/)
		.find((line) => line.startsWith("data: "));
	const message: JsonRpcMessage | null = dataLine
		? (JSON.parse(dataLine.slice(6)) as JsonRpcMessage)
		: null;
	return { response, text, message };
};

const toolsList = async (handler: McpHttpHandler) =>
	rpc(handler, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });

const toolNames = async (handler: McpHttpHandler): Promise<string[]> =>
	(await toolsList(handler)).message?.result?.tools?.map((tool) => tool.name) ??
	[];

type ToolCallResult = {
	isError?: boolean;
	content?: { type?: string; text?: string }[];
	structuredContent?: Record<string, unknown>;
};

const callTool = async (
	handler: McpHttpHandler,
	name: string,
	args: Record<string, unknown>,
): Promise<ToolCallResult> => {
	const { message } = await rpc(handler, {
		jsonrpc: "2.0",
		id: 2,
		method: "tools/call",
		params: { name, arguments: args },
	});
	assert.ok(message?.result, "tools/call should return a result");
	return message.result as unknown as ToolCallResult;
};

const fakeAuth = () =>
	({
		options: {},
		$context: Promise.resolve({
			baseURL: BASE_URL,
			internalAdapter: {},
		}),
	}) as unknown as Auth;

const fakeApiKeyDao = async ({
	token,
	scopes = ["read", "write", "admin"],
}: {
	token: string;
	scopes?: string[];
}) => {
	const hash = await sha256Hex(token);
	const touches: string[] = [];
	const dao = {
		findByHash: async (lookup: string) =>
			lookup === hash
				? {
						id: "key-1",
						orgId: ORG_ID,
						name: "Test key",
						prefix: "sk_test",
						keyHash: hash,
						scopes,
						createdById: USER_ID,
						lastUsedAt: null,
						revokedAt: null,
						createdAt: new Date(NOW),
						updatedAt: new Date(NOW),
					}
				: null,
		touchLastUsed: async (id: string) => {
			touches.push(id);
		},
	};
	return { dao, touches };
};

const resolveWithApiKey = async (
	token: string,
	scopes?: string[],
): Promise<McpAuthResult> => {
	const { dao } = await fakeApiKeyDao({ token, scopes });
	const result = await resolveMcpAuth({
		request: new Request(RESOURCE, {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
		}),
		deps: {
			apiKeyDao: dao as unknown as Pick<
				ApiKeyDao,
				"findByHash" | "touchLastUsed"
			>,
			background: (task) => {
				void task();
			},
		},
		auth: fakeAuth(),
		config: { resource: RESOURCE },
	});
	return result;
};

test("an API key can initialize, list scoped tools and call a read tool", async () => {
	const auth = await resolveWithApiKey("sk_test");
	assert.ok("principal" in auth, "API key should authenticate");
	assert.equal(auth.principal.orgId, ORG_ID);
	assert.deepEqual(auth.principal.scopes, ["read", "write", "admin"]);
	assert.equal(auth.principal.authInfo.clientId, "key-1");
	assert.deepEqual(auth.principal.authInfo.extra, {
		authMethod: "api_key",
		orgId: ORG_ID,
		userId: USER_ID,
		keyId: "key-1",
		scopes: ["read", "write", "admin"],
	});

	const layer = createLayer();
	const runtime = runtimeFor({
		principal: auth.principal,
		layer,
		memberState: {
			frozen: false,
			role: "owner",
			member: true,
			memberships: [],
		},
	});
	const handler = handlerFor(runtime);

	const initialized = await rpc(handler, {
		jsonrpc: "2.0",
		id: 0,
		method: "initialize",
		params: {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0.0" },
		},
	});
	assert.equal(initialized.response.status, 200);

	const names = await toolNames(handler);
	assert.ok(names.includes("list_issues"));
	assert.ok(names.includes("create_issue"));
	assert.ok(names.includes("list_orgs"));

	const listed = await toolsList(handler);
	const createIssue = listed.message?.result?.tools?.find(
		(tool) => tool.name === "create_issue",
	);
	assert.deepEqual(createIssue?.annotations, {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
	});
	const listIssues = listed.message?.result?.tools?.find(
		(tool) => tool.name === "list_issues",
	);
	assert.equal(listIssues?.annotations?.readOnlyHint, true);
	assert.equal(listIssues?.annotations?.idempotentHint, true);

	const result = await callTool(handler, "list_issues", {});
	assert.equal(result.isError, undefined);
	assert.equal(result.structuredContent?.summary, "Found 0 issue(s).");
	assert.equal(layer.calls[0]?.orgId, ORG_ID);
});

test("a read-only API key sees no write tools", async () => {
	const auth = await resolveWithApiKey("sk_test", ["read"]);
	assert.ok("principal" in auth);
	const layer = createLayer();
	const handler = handlerFor(
		runtimeFor({
			principal: auth.principal,
			layer,
			memberState: {
				frozen: false,
				role: "owner",
				member: true,
				memberships: [],
			},
		}),
	);
	const names = await toolNames(handler);
	assert.ok(names.includes("list_issues"));
	assert.ok(!names.includes("create_issue"));
	assert.ok(!names.includes("create_project"));
});

test("an API key cannot override its organization through orgId", async () => {
	const auth = await resolveWithApiKey("sk_test");
	assert.ok("principal" in auth);
	const layer = createLayer();
	const handler = handlerFor(
		runtimeFor({
			principal: auth.principal,
			layer,
			memberState: {
				frozen: false,
				role: "owner",
				member: true,
				memberships: [],
			},
		}),
	);
	const result = await callTool(handler, "create_issue", {
		orgId: "org-2",
		title: "Cross-org write",
	});
	assert.equal(result.isError, true);
	assert.deepEqual(result.structuredContent?.error, {
		code: ApiErrorCode.FORBIDDEN,
		message: "This API key is scoped to a different organization.",
	});
	assert.equal(layer.calls.length, 0);
});

test("a frozen organization hides write tools", async () => {
	const auth = await resolveWithApiKey("sk_test");
	assert.ok("principal" in auth);
	const layer = createLayer();
	const handler = handlerFor(
		runtimeFor({
			principal: auth.principal,
			layer,
			memberState: {
				frozen: true,
				role: "owner",
				member: true,
				memberships: [],
			},
		}),
	);

	const names = await toolNames(handler);
	assert.ok(names.includes("list_issues"));
	assert.ok(!names.includes("create_issue"));
	assert.equal(layer.calls.length, 0);
});

test("capability errors become MCP tool errors instead of JSON-RPC errors", async () => {
	const auth = await resolveWithApiKey("sk_test");
	assert.ok("principal" in auth);
	const layer = createLayer({
		get_issue: async () => {
			throw new ApiError(404, ApiErrorCode.ISSUE_NOT_FOUND, "Issue not found");
		},
	});
	const handler = handlerFor(
		runtimeFor({
			principal: auth.principal,
			layer,
			memberState: {
				frozen: false,
				role: "owner",
				member: true,
				memberships: [],
			},
		}),
	);
	const result = await callTool(handler, "get_issue", { issueId: "missing" });
	assert.equal(result.isError, true);
	assert.deepEqual(result.structuredContent?.error, {
		code: ApiErrorCode.ISSUE_NOT_FOUND,
		message: "Issue not found",
	});
	assert.ok(result.content?.[0]?.text?.includes(ApiErrorCode.ISSUE_NOT_FOUND));
});

test("a revoked or unknown API key receives a 401", async () => {
	const unknown = await resolveMcpAuth({
		request: new Request(RESOURCE, {
			method: "POST",
			headers: { authorization: "Bearer sk_unknown" },
		}),
		deps: {
			apiKeyDao: {
				findByHash: async () => null,
				touchLastUsed: async () => undefined,
			},
		},
		auth: fakeAuth(),
		config: { resource: RESOURCE },
	});
	assert.ok("response" in unknown);
	assert.equal(unknown.response.status, 401);
	assert.match(
		unknown.response.headers.get("www-authenticate") ?? "",
		/Bearer realm="mcp"/,
	);

	const revoked = await resolveMcpAuth({
		request: new Request(RESOURCE, {
			method: "POST",
			headers: { authorization: "Bearer sk_revoked" },
		}),
		deps: {
			apiKeyDao: {
				findByHash: async (lookup: string) => ({
					id: "key-1",
					orgId: ORG_ID,
					name: "Revoked key",
					prefix: "sk_rev",
					keyHash: lookup,
					scopes: ["read"],
					createdById: USER_ID,
					lastUsedAt: null,
					revokedAt: new Date(NOW),
					createdAt: new Date(NOW),
					updatedAt: new Date(NOW),
				}),
				touchLastUsed: async () => undefined,
			},
		},
		auth: fakeAuth(),
		config: { resource: RESOURCE },
	});
	assert.ok("response" in revoked);
	assert.equal(revoked.response.status, 401);
});

test("OAuth requests without a token receive the RFC 9728 challenge", async () => {
	const result = await resolveMcpAuth({
		request: new Request(RESOURCE, { method: "POST" }),
		deps: {
			apiKeyDao: {
				findByHash: async () => null,
				touchLastUsed: async () => undefined,
			},
		},
		auth: fakeAuth(),
		config: { resource: RESOURCE },
	});
	assert.ok("response" in result);
	assert.equal(result.response.status, 401);
	const challenge = result.response.headers.get("www-authenticate") ?? "";
	assert.match(challenge, /^Bearer /);
	assert.match(
		challenge,
		/resource_metadata="https:\/\/api\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/,
	);
});

test("OAuth scope claims map onto app scopes", () => {
	assert.deepEqual(normalizeOAuthScopes("openid profile mcp:read"), ["read"]);
	assert.deepEqual(normalizeOAuthScopes("mcp:write mcp:admin"), [
		"write",
		"admin",
	]);
	assert.deepEqual(normalizeOAuthScopes("openid offline_access"), []);
});

test("OAuth callers must disambiguate between multiple organizations", async () => {
	const layer = createLayer();
	const handler = handlerFor(
		runtimeFor({
			principal: oauthPrincipal(["read", "write"]),
			layer,
			memberState: {
				frozen: false,
				role: "owner",
				member: true,
				memberships: [
					{
						id: "org-1",
						name: "Acme",
						slug: "acme",
						frozen: false,
						role: "owner",
					},
					{
						id: "org-2",
						name: "Beta",
						slug: "beta",
						frozen: false,
						role: "member",
					},
				],
			},
		}),
	);
	const result = await callTool(handler, "create_issue", {
		title: "Needs org",
	});
	assert.equal(result.isError, true);
	assert.equal(
		(result.structuredContent?.error as { code?: string } | undefined)?.code,
		ApiErrorCode.MCP_ORG_REQUIRED,
	);
	assert.match(result.content?.[0]?.text ?? "", /list_orgs/);
	assert.equal(layer.calls.length, 0);
});

test("an OAuth caller with one organization uses it implicitly", async () => {
	const layer = createLayer();
	const handler = handlerFor(
		runtimeFor({
			principal: oauthPrincipal(["read", "write"]),
			layer,
			memberState: {
				frozen: false,
				role: "admin",
				member: true,
				memberships: [
					{
						id: ORG_ID,
						name: "Acme",
						slug: "acme",
						frozen: false,
						role: "admin",
					},
				],
			},
		}),
	);
	const result = await callTool(handler, "list_issues", {});
	assert.equal(result.isError, undefined);
	assert.equal(layer.calls[0]?.orgId, ORG_ID);
});

test("admin tools are hidden from OAuth members but shown to org admins", async () => {
	const memberRuntime = runtimeFor({
		principal: oauthPrincipal(["read", "write", "admin"]),
		layer: createLayer(),
		memberState: {
			frozen: false,
			role: "member",
			member: true,
			memberships: [
				{
					id: ORG_ID,
					name: "Acme",
					slug: "acme",
					frozen: false,
					role: "member",
				},
			],
		},
	});
	const memberNames = await toolNames(handlerFor(memberRuntime));
	assert.ok(!memberNames.includes("create_project"));

	const adminRuntime = runtimeFor({
		principal: oauthPrincipal(["read", "write", "admin"]),
		layer: createLayer(),
		memberState: {
			frozen: false,
			role: "admin",
			member: true,
			memberships: [
				{
					id: ORG_ID,
					name: "Acme",
					slug: "acme",
					frozen: false,
					role: "admin",
				},
			],
		},
	});
	const adminNames = await toolNames(handlerFor(adminRuntime));
	assert.ok(adminNames.includes("create_project"));
});

test("resource templates read issues and projects through capabilities", async () => {
	const auth = await resolveWithApiKey("sk_test", ["read"]);
	assert.ok("principal" in auth);
	const layer = createLayer();
	const handler = handlerFor(
		runtimeFor({
			principal: auth.principal,
			layer,
			memberState: {
				frozen: false,
				role: "owner",
				member: true,
				memberships: [],
			},
		}),
	);

	const templates = await rpc(handler, {
		jsonrpc: "2.0",
		id: 3,
		method: "resources/templates/list",
		params: {},
	});
	assert.deepEqual(
		templates.message?.result?.resourceTemplates?.map(
			(template) => template.uriTemplate,
		),
		["issue://{orgId}/{issueKey}", "project://{orgId}/{projectKey}"],
	);

	const issueRead = await rpc(handler, {
		jsonrpc: "2.0",
		id: 4,
		method: "resources/read",
		params: { uri: `issue://${ORG_ID}/WEB-12` },
	});
	const contents = issueRead.message?.result?.contents ?? [];
	assert.equal(contents[0]?.mimeType, "application/json");
	const issuePayload = JSON.parse(contents[0]?.text ?? "{}") as {
		data?: { issue?: { id?: string } };
		summary?: string;
	};
	assert.equal(issuePayload.data?.issue?.id, "issue-1");
	assert.equal(issuePayload.summary, "Issue #12: Login fails.");
	assert.equal(contents[1]?.mimeType, "text/plain");

	const projectRead = await rpc(handler, {
		jsonrpc: "2.0",
		id: 5,
		method: "resources/read",
		params: { uri: `project://${ORG_ID}/WEB` },
	});
	const projectContents = projectRead.message?.result?.contents ?? [];
	const projectPayload = JSON.parse(projectContents[0]?.text ?? "{}") as {
		data?: { project?: { id?: string } };
	};
	assert.equal(projectPayload.data?.project?.id, "project-1");
	assert.deepEqual(
		layer.calls.map((call) => call.name),
		["get_issue", "list_projects", "get_project"],
	);
});

test("resources reject an API key organization mismatch", async () => {
	const auth = await resolveWithApiKey("sk_test", ["read"]);
	assert.ok("principal" in auth);
	const handler = handlerFor(
		runtimeFor({
			principal: auth.principal,
			layer: createLayer(),
			memberState: {
				frozen: false,
				role: "owner",
				member: true,
				memberships: [],
			},
		}),
	);
	const read = await rpc(handler, {
		jsonrpc: "2.0",
		id: 6,
		method: "resources/read",
		params: { uri: "issue://org-2/WEB-12" },
	});
	assert.equal(read.message?.result?.contents, undefined);
	assert.ok(read.message?.error);
});

test("prompts are listed and return tool instructions", async () => {
	const auth = await resolveWithApiKey("sk_test", ["read"]);
	assert.ok("principal" in auth);
	const handler = handlerFor(
		runtimeFor({
			principal: auth.principal,
			layer: createLayer(),
			memberState: {
				frozen: false,
				role: "owner",
				member: true,
				memberships: [],
			},
		}),
	);
	const listed = await rpc(handler, {
		jsonrpc: "2.0",
		id: 7,
		method: "prompts/list",
		params: {},
	});
	assert.deepEqual(
		listed.message?.result?.prompts?.map((prompt) => prompt.name),
		["summarize_issue", "triage_backlog", "draft_comment", "weekly_digest"],
	);

	const prompt = await rpc(handler, {
		jsonrpc: "2.0",
		id: 8,
		method: "prompts/get",
		params: {
			name: "summarize_issue",
			arguments: { orgId: ORG_ID, issueKey: "WEB-12" },
		},
	});
	const text = prompt.message?.result?.messages?.[0]?.content?.text ?? "";
	assert.match(text, /get_issue/);
	assert.match(text, /WEB-12/);
});

test("the migration creating MCP auth tables exists", () => {
	const migrationsDir = fileURLToPath(
		new URL("../drizzle", import.meta.url).href,
	);
	const sql = readdirSync(migrationsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) =>
			readFileSync(join(migrationsDir, entry.name, "migration.sql"), "utf8"),
		)
		.join("\n");
	for (const table of [
		"jwks",
		"oauth_client",
		"oauth_resource",
		"oauth_client_resource",
		"oauth_refresh_token",
		"oauth_access_token",
		"oauth_consent",
		"oauth_client_assertion",
	]) {
		assert.match(
			sql,
			new RegExp(`CREATE TABLE \`${table}\``),
			`missing table ${table}`,
		);
	}
});
