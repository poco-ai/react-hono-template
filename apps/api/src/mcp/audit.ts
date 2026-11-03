import type { CapabilityEffect } from "../capabilities/types";
import type { AiToolCallDao } from "../dao/ai-tool-call.dao";
import { sha256Hex } from "../lib/crypto";

/**
 * MCP tool-call audit.
 *
 * Writes and destructive calls are always recorded; reads are sampled (10%)
 * to avoid write amplification on every list/get. Failures are always
 * recorded. Recording is best-effort and never affects the tool result.
 */
const READ_SAMPLE_RATE = 0.1;

export type McpToolAuditEvent = {
	orgId?: string;
	userId?: string;
	toolName: string;
	effect: CapabilityEffect;
	status: "succeeded" | "failed";
	errorCode?: string;
	durationMs: number;
	input: unknown;
};

export type McpAudit = (event: McpToolAuditEvent) => void;

export type McpAuditBackground = (task: () => Promise<unknown>) => void;

const safeInputJson = (input: unknown): string => {
	try {
		return JSON.stringify(input) ?? "";
	} catch {
		return "";
	}
};

const shouldRecord = (event: McpToolAuditEvent): boolean => {
	if (event.effect !== "read") return true;
	if (event.status === "failed") return true;
	return Math.random() < READ_SAMPLE_RATE;
};

export const createMcpAudit = ({
	dao,
	background,
}: {
	dao?: Pick<AiToolCallDao, "record">;
	background: McpAuditBackground;
}): McpAudit => {
	if (!dao) return () => undefined;
	return (event) => {
		if (!event.orgId || !shouldRecord(event)) return;
		const orgId = event.orgId;
		background(async () => {
			try {
				await dao.record({
					id: crypto.randomUUID(),
					orgId,
					userId: event.userId ?? null,
					conversationId: null,
					surface: "mcp",
					toolName: event.toolName,
					effect: event.effect,
					status: event.status,
					inputHash: await sha256Hex(safeInputJson(event.input)),
					errorCode: event.errorCode ?? null,
					durationMs: event.durationMs,
				});
			} catch (error) {
				console.error("[mcp] failed to record tool call:", error);
			}
		});
	};
};
