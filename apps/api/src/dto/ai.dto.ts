import type { PlanName } from "@workspace/shared";
import type { AiProviderInfo } from "../ai/provider";
import type { CapabilityEffect } from "../capabilities/types";

export type AiContextType = "issue" | "project";

export type AiContextSnapshot = {
	type: AiContextType;
	id: string;
	label?: string;
	projectId?: string;
	number?: number;
};

export type AiConversationDto = {
	id: string;
	orgId: string;
	userId: string;
	title: string | null;
	contextType: string | null;
	contextId: string | null;
	pinned: boolean;
	model: string | null;
	lastMessageAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type AiConversationListDto = {
	items: AiConversationDto[];
	nextCursor: string | null;
};

export type AiMessageDto = {
	id: string;
	conversationId: string;
	orgId: string;
	userId: string;
	role: string;
	parts: unknown[];
	status: string;
	model: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	context: AiContextSnapshot | null;
	createdAt: string;
};

export type AiToolCallStatus =
	| "proposed"
	| "approved"
	| "rejected"
	| "succeeded"
	| "failed";

export type AiToolCallDto = {
	id: string;
	orgId: string;
	userId: string | null;
	conversationId: string | null;
	surface: string;
	toolName: string;
	effect: CapabilityEffect;
	status: AiToolCallStatus;
	inputHash: string | null;
	inputSummary: string | null;
	idempotencyKey: string | null;
	errorCode: string | null;
	durationMs: number | null;
	createdAt: string;
};

export type AiConversationDetailDto = {
	conversation: AiConversationDto;
	messages: AiMessageDto[];
	pendingApprovals: AiToolCallDto[];
};

export type AiUsageTotalsDto = {
	month: string;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	toolCalls: number;
};

export type AiUsageLimitsDto = {
	plan: PlanName;
	monthlyTokens: number;
	requestsPerMinute: number;
	maxSteps: number;
};

export type AiUsageSummaryDto = AiUsageTotalsDto & {
	limits: AiUsageLimitsDto;
	provider: AiProviderInfo;
	enabled: boolean;
};

export type OrgAiSettingsDto = {
	orgId: string;
	enabled: boolean;
	defaultModel: string | null;
	retentionDays: number;
	strictMcpWrites: boolean;
	updatedBy: string | null;
	updatedAt: string | null;
};

export type OrgAiSettingsViewDto = {
	settings: OrgAiSettingsDto;
	provider: AiProviderInfo;
	usage: AiUsageTotalsDto & { limits: AiUsageLimitsDto };
	enabled: boolean;
};
