import type { McpServer } from "@modelcontextprotocol/server";
import { type ApiKeyScope, scopeSatisfies } from "@workspace/shared";
import { z } from "zod";
import type { McpToolRuntime } from "./tools";

const canRead = (scopes: readonly ApiKeyScope[]) =>
	scopeSatisfies(scopes, "read");

const issuePromptArgs = z.object({
	orgId: z.string().min(1).describe("Organization id."),
	issueKey: z
		.string()
		.min(1)
		.describe("Issue key such as WEB-12 (project key plus number)."),
});

const textMessage = (text: string) => ({
	messages: [
		{
			role: "user" as const,
			content: { type: "text" as const, text },
		},
	],
});

/**
 * Model-facing prompt templates. They instruct the client which tools to call
 * and never embed organization data themselves.
 */
export const registerMcpPrompts = (
	server: McpServer,
	runtime: McpToolRuntime,
) => {
	if (!canRead(runtime.principal.scopes)) return;

	server.registerPrompt(
		"summarize_issue",
		{
			title: "Summarize issue",
			description: "Summarize an issue with its comments and recent activity.",
			argsSchema: issuePromptArgs,
		},
		({ orgId, issueKey }) =>
			textMessage(
				[
					`Summarize issue "${issueKey}" in organization "${orgId}".`,
					`Call get_issue with orgId "${orgId}", projectKey (the part before the dash) and number (the part after the dash). Then call list_comments and get_issue_activity for the same issue.`,
					"Return a concise Markdown summary covering status, priority, assignee, the latest discussion points, blockers, and suggested next steps.",
					"Do not invent data. If a tool returns an error, report the error instead of guessing.",
				].join("\n\n"),
			),
	);

	server.registerPrompt(
		"triage_backlog",
		{
			title: "Triage backlog",
			description: "Review a project's backlog and propose a prioritized plan.",
			argsSchema: z.object({
				orgId: z.string().min(1).describe("Organization id."),
				projectKey: z.string().min(1).describe("Project key such as WEB."),
			}),
		},
		({ orgId, projectKey }) =>
			textMessage(
				[
					`Triage the backlog of project "${projectKey}" in organization "${orgId}".`,
					`First call list_projects with orgId "${orgId}" to resolve the project id. Then call list_issues with that projectId and status ["backlog"], paging through results. Use get_issue for details and list_comments when an issue needs context.`,
					"Rank the issues by impact, urgency and age, and explain the reasoning. Group small related fixes together.",
					"This is analysis only: do not modify issues unless the user explicitly asks. If they do, use update_issue and confirm destructive actions first.",
				].join("\n\n"),
			),
	);

	server.registerPrompt(
		"draft_comment",
		{
			title: "Draft comment",
			description:
				"Draft a comment for an issue based on its current state and discussion.",
			argsSchema: issuePromptArgs.extend({
				tone: z
					.string()
					.max(40)
					.optional()
					.describe("Optional tone, e.g. concise, friendly, formal."),
			}),
		},
		({ orgId, issueKey, tone }) =>
			textMessage(
				[
					`Draft a comment for issue "${issueKey}" in organization "${orgId}".`,
					`Call get_issue and list_comments for the issue so the draft reflects the current state and discussion. Use a ${tone?.trim() || "clear and friendly"} tone.`,
					"Return only the proposed comment text. Do not post it unless the user explicitly approves; if they do, post it with create_comment.",
				].join("\n\n"),
			),
	);

	server.registerPrompt(
		"weekly_digest",
		{
			title: "Weekly digest",
			description:
				"Produce a weekly engineering digest from recent organization activity.",
			argsSchema: z.object({
				orgId: z.string().min(1).describe("Organization id."),
			}),
		},
		({ orgId }) =>
			textMessage(
				[
					`Produce a weekly digest for organization "${orgId}".`,
					`Call get_org_activity with orgId "${orgId}" and limit 100 to see recent changes. Then call list_projects and list_issues to check current work in the most active projects.`,
					"Return Markdown with: completed work, work in progress, blocked items, risks, and a short list of recommended next actions.",
					"Do not modify any data; this is a read-only report.",
				].join("\n\n"),
			),
	);
};

export const mcpPromptNames = [
	"summarize_issue",
	"triage_backlog",
	"draft_comment",
	"weekly_digest",
] as const;
