import {
	type McpServer,
	ResourceNotFoundError,
	ResourceTemplate,
	type Variables,
} from "@modelcontextprotocol/server";
import { ApiError, type ApiKeyScope, scopeSatisfies } from "@workspace/shared";
import type { CapabilityResult } from "../capabilities/types";
import { buildCapabilityContext, type McpToolRuntime } from "./tools";

const ISSUE_URI = "issue://{orgId}/{issueKey}";
const PROJECT_URI = "project://{orgId}/{projectKey}";

const variable = (variables: Variables, name: string): string | undefined => {
	const value = variables[name];
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value[0];
	return undefined;
};

const canRead = (scopes: readonly ApiKeyScope[]) =>
	scopeSatisfies(scopes, "read");

/**
 * Checks that the URI's organization is readable by the caller and returns the
 * caller's role there (used only for capability context; reads never require a
 * role).
 */
const resolveResourceOrg = async ({
	runtime,
	uri,
	orgId,
}: {
	runtime: McpToolRuntime;
	uri: string;
	orgId: string;
}): Promise<{ role?: string }> => {
	const { principal, memberDao } = runtime;
	if (principal.method === "api_key") {
		if (!principal.orgId || principal.orgId !== orgId) {
			throw new ResourceNotFoundError(uri, "Resource not found.");
		}
		return {};
	}
	if (!principal.userId) {
		throw new ResourceNotFoundError(uri, "Resource not found.");
	}
	const membership = await memberDao.findByOrgAndUser(orgId, principal.userId);
	if (!membership) {
		throw new ResourceNotFoundError(uri, "Resource not found.");
	}
	return { role: membership.role };
};

const asResourceNotFound = (uri: string, error: unknown): never => {
	if (error instanceof ApiError) {
		throw new ResourceNotFoundError(uri, error.message);
	}
	throw error;
};

const jsonContents = (
	uri: string,
	summary: string,
	data: unknown,
	links: unknown,
) => ({
	contents: [
		{
			uri,
			mimeType: "application/json",
			text: JSON.stringify({ summary, data, links }),
		},
		{
			uri,
			mimeType: "text/plain",
			text: summary,
		},
	],
});

const readIssue = async (
	runtime: McpToolRuntime,
	uri: URL,
	variables: Variables,
) => {
	const orgId = variable(variables, "orgId");
	const issueKey = variable(variables, "issueKey");
	if (!orgId || !issueKey) {
		throw new ResourceNotFoundError(
			uri.href,
			"Both orgId and an issue key such as WEB-12 are required.",
		);
	}
	const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(issueKey.trim());
	if (!match) {
		throw new ResourceNotFoundError(
			uri.href,
			"Issue key must look like WEB-12.",
		);
	}
	const projectKey = match[1] as string;
	const number = Number.parseInt(match[2] as string, 10);

	try {
		const { role } = await resolveResourceOrg({
			runtime,
			uri: uri.href,
			orgId,
		});
		const result = await runtime.layer.execute<{
			issue: unknown;
		}>("get_issue", buildCapabilityContext({ runtime, orgId, role }), {
			projectKey,
			number,
		});
		const links = result.links;
		return jsonContents(uri.href, result.summary, result.data, links);
	} catch (error) {
		return asResourceNotFound(uri.href, error);
	}
};

const readProject = async (
	runtime: McpToolRuntime,
	uri: URL,
	variables: Variables,
) => {
	const orgId = variable(variables, "orgId");
	const projectKey = variable(variables, "projectKey");
	if (!orgId || !projectKey) {
		throw new ResourceNotFoundError(
			uri.href,
			"Both orgId and a project key such as WEB are required.",
		);
	}
	try {
		const { role } = await resolveResourceOrg({
			runtime,
			uri: uri.href,
			orgId,
		});
		const ctx = buildCapabilityContext({ runtime, orgId, role });
		const projects = await runtime.layer.execute<{
			projects: { id: string; key: string }[];
		}>("list_projects", ctx, { includeArchived: true });
		const match = projects.data.projects.find(
			(project) =>
				project.key.toLowerCase() === projectKey.trim().toLowerCase(),
		);
		if (!match) {
			throw new ResourceNotFoundError(
				uri.href,
				`Project ${projectKey} not found.`,
			);
		}
		const result: CapabilityResult<unknown> = await runtime.layer.execute(
			"get_project",
			ctx,
			{ projectId: match.id },
		);
		return jsonContents(uri.href, result.summary, result.data, result.links);
	} catch (error) {
		return asResourceNotFound(uri.href, error);
	}
};

/** Registers the issue/project resource templates for read-scoped callers. */
export const registerMcpResources = (
	server: McpServer,
	runtime: McpToolRuntime,
) => {
	if (!canRead(runtime.principal.scopes)) return;

	server.registerResource(
		"issue",
		new ResourceTemplate(ISSUE_URI, { list: undefined }),
		{
			title: "Issue",
			description:
				"A single issue as JSON, addressed by organization id and issue key (e.g. WEB-12).",
			mimeType: "application/json",
		},
		async (uri, variables) => readIssue(runtime, uri, variables),
	);

	server.registerResource(
		"project",
		new ResourceTemplate(PROJECT_URI, { list: undefined }),
		{
			title: "Project",
			description:
				"A single project as JSON, addressed by organization id and project key (e.g. WEB).",
			mimeType: "application/json",
		},
		async (uri, variables) => readProject(runtime, uri, variables),
	);
};

export const mcpResourceTemplates = [ISSUE_URI, PROJECT_URI] as const;
