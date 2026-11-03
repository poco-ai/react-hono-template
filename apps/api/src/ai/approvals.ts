import { ApiError, ApiErrorCode } from "@workspace/shared";
import { isDynamicToolUIPart, isToolUIPart, type UIMessage } from "ai";
import type { AiToolCallDao } from "../dao/ai-tool-call.dao";
import { sha256Hex } from "../lib/crypto";

export type AiApprovalDecision = {
	toolCallId: string;
	approved: boolean;
	toolName: string;
};

type ApprovalLookup = Pick<AiToolCallDao, "findForConversation" | "markStatus">;

/**
 * Verifies user approval responses sent back by the AI SDK chat transport.
 *
 * Every response must correspond to a `proposed` write/destructive tool call
 * stored for this conversation; otherwise the request is rejected. Denials are
 * recorded so the pending-approval list stays accurate, but the capability is
 * never executed.
 */
/**
 * Removes tool results from client-supplied history unless the tool call is
 * stored for this conversation. Text parts are kept; a fabricated tool output
 * must not become trusted context for the next model turn.
 */
export const dropUnverifiedToolParts = async (
	messages: UIMessage[],
	lookup: Pick<AiToolCallDao, "findForConversation">,
	orgId: string,
	conversationId: string,
): Promise<UIMessage[]> => {
	const result: UIMessage[] = [];
	for (const message of messages) {
		if (message.role !== "assistant") {
			result.push(message);
			continue;
		}
		const parts: UIMessage["parts"] = [];
		for (const part of message.parts) {
			if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) {
				parts.push(part);
				continue;
			}
			if (
				part.state !== "output-available" &&
				part.state !== "output-error" &&
				part.state !== "output-denied"
			) {
				parts.push(part);
				continue;
			}
			const stored = await lookup.findForConversation(
				orgId,
				conversationId,
				part.toolCallId,
			);
			if (stored) {
				parts.push(part);
			}
		}
		if (parts.length > 0) {
			result.push({ ...message, parts });
		}
	}
	return result;
};

export const verifyApprovalResponses = async (
	messages: UIMessage[],
	lookup: ApprovalLookup,
	orgId: string,
	conversationId: string,
): Promise<AiApprovalDecision[]> => {
	const decisions: AiApprovalDecision[] = [];
	const seen = new Set<string>();

	for (const message of messages) {
		if (message.role !== "assistant") continue;
		for (const part of message.parts) {
			if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) continue;
			if (part.state !== "approval-responded") continue;
			if (seen.has(part.toolCallId)) continue;
			seen.add(part.toolCallId);

			const stored = await lookup.findForConversation(
				orgId,
				conversationId,
				part.toolCallId,
			);
			if (!stored) {
				throw new ApiError(
					400,
					ApiErrorCode.AI_APPROVAL_NOT_FOUND,
					`No pending approval found for tool call ${part.toolCallId}.`,
				);
			}

			// Retried requests can replay an approval response after the first
			// request already recorded it. Treat those as idempotent instead of
			// permanently locking the conversation.
			if (stored.status !== "proposed") {
				continue;
			}

			const input = "input" in part ? part.input : undefined;
			if (stored.inputHash) {
				const submittedHash = await sha256Hex(JSON.stringify(input ?? null));
				if (submittedHash !== stored.inputHash) {
					throw new ApiError(
						400,
						ApiErrorCode.AI_APPROVAL_NOT_FOUND,
						`The approved input for tool call ${part.toolCallId} does not match the proposed action.`,
					);
				}
			}

			const approved = part.approval?.approved === true;
			decisions.push({
				toolCallId: part.toolCallId,
				approved,
				toolName: stored.toolName,
			});
			await lookup.markStatus(
				orgId,
				conversationId,
				part.toolCallId,
				approved ? "approved" : "rejected",
			);
		}
	}

	return decisions;
};
