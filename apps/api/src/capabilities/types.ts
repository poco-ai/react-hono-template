import type { ApiKeyScope } from "@workspace/shared";
import type { z } from "zod";
import type { MemberDao } from "../dao/member.dao";
import type { OrganizationDao } from "../dao/organization.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { ActivityService } from "../services/activity.service";
import type { CommentService } from "../services/comment.service";
import type { IssueService } from "../services/issue.service";
import type { LabelService } from "../services/label.service";
import type { ProjectService } from "../services/project.service";
import type { RelationService } from "../services/relation.service";
import type { StatusService } from "../services/status.service";
import type { ViewService } from "../services/view.service";

export type CapabilityEffect = "read" | "write" | "destructive";

export type OrgRole = "owner" | "admin" | "member";

export type CapabilitySurface = "chat" | "panel" | "mcp" | "api";

export type CapabilityActor = {
	userId?: string;
	keyId?: string;
	surface: CapabilitySurface;
	scopes: ApiKeyScope[];
	role?: OrgRole;
};

export type CapabilityContext = {
	orgId?: string;
	actor: CapabilityActor;
	canWrite: boolean;
	locale: "en" | "zh";
	webBaseUrl: string;
	background: (task: () => Promise<unknown>) => void;
};

export type CapabilityLink = {
	/** i18n key for the link label (resolved by the consuming surface). */
	labelKey: string;
	url: string;
};

export type CapabilityResult<TData = unknown> = {
	data: TData;
	/** Short English sentence describing what happened, for UI/model display. */
	summary: string;
	links: CapabilityLink[];
};

export type CapabilityDefinition<TInput = unknown, TOutput = unknown> = {
	/** Unique snake_case tool name exposed to the model/MCP client. */
	name: string;
	titleKey: string;
	description: string;
	input: z.ZodType<TInput>;
	output?: z.ZodType<TOutput>;
	effect: CapabilityEffect;
	scopes: readonly ApiKeyScope[];
	minOrgRole?: "owner" | "admin";
	/**
	 * Whether the capability requires `ctx.orgId`. Defaults to true; only
	 * user-level capabilities such as `list_orgs` opt out.
	 */
	orgScoped?: boolean;
	execute: (
		ctx: CapabilityContext,
		input: TInput,
	) => Promise<CapabilityResult<TOutput>>;
};

/**
 * Type-erased capability used by the registry/executor. `defineCapability`
 * performs the (sound) cast once at registration time.
 */
export type CapabilityEntry = {
	name: string;
	titleKey: string;
	description: string;
	input: z.ZodType<unknown>;
	output?: z.ZodType<unknown>;
	effect: CapabilityEffect;
	scopes: readonly ApiKeyScope[];
	minOrgRole?: "owner" | "admin";
	orgScoped?: boolean;
	execute: (
		ctx: CapabilityContext,
		input: unknown,
	) => Promise<CapabilityResult<unknown>>;
};

export const defineCapability = <TInput, TOutput>(
	capability: CapabilityDefinition<TInput, TOutput>,
): CapabilityEntry => ({
	...capability,
	input: capability.input as unknown as z.ZodType<unknown>,
	output: capability.output as unknown as z.ZodType<unknown> | undefined,
	execute: (ctx, input) => capability.execute(ctx, input as TInput),
});

export type CapabilityServices = {
	projectService: Pick<
		ProjectService,
		"listProjects" | "getProject" | "createProject"
	>;
	issueService: Pick<
		IssueService,
		| "listIssues"
		| "getIssue"
		| "getIssueById"
		| "createIssue"
		| "updateIssue"
		| "deleteIssue"
	>;
	commentService: Pick<
		CommentService,
		"listComments" | "createComment" | "updateComment" | "deleteComment"
	>;
	labelService: Pick<
		LabelService,
		"listLabels" | "createLabel" | "updateLabel" | "deleteLabel"
	>;
	statusService: Pick<StatusService, "listStatuses">;
	activityService: Pick<ActivityService, "listByIssue" | "listByOrg">;
	relationService: Pick<
		RelationService,
		"listRelations" | "createRelation" | "deleteRelation"
	>;
	viewService: Pick<ViewService, "listViews" | "createView">;
};

export type CapabilityDaos = {
	memberDao: Pick<
		MemberDao,
		"findByOrgAndUser" | "isOrgFrozen" | "listMembershipsByUser" | "listByOrg"
	>;
	organizationDao: Pick<OrganizationDao, "findById">;
	projectDao: Pick<ProjectDao, "findByKey">;
};

export type CapabilityDeps = {
	services: CapabilityServices;
	daos: CapabilityDaos;
};
