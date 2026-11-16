import { ApiError, ApiErrorCode } from "@workspace/shared";
import {
	getToolName,
	isDynamicToolUIPart,
	isToolUIPart,
	type UIMessage,
} from "ai";
import type { AiToolCallDao } from "../dao/ai-tool-call.dao";
import { sha256Hex } from "../lib/crypto";

type ApprovalLookup = Pick<
	AiToolCallDao,
	"findForConversation" | "claimProposedStatus"
>;

const forceDenial = (part: unknown) => {
	if (typeof part !== "object" || part === null || !("approval" in part))
		return;
	const approval = (part as { approval?: { approved?: boolean } }).approval;
	if (approval) approval.approved = false;
};

/**
 * Verifies user approval responses sent back by the AI SDK chat transport.
 *
 * Every response must match a stored `proposed` tool call for this
 * conversation (tool name and input hash). Claiming the proposal is a
 * compare-and-set, so concurrent replays can execute at most once; the loser
 * is forced to a denial. Denials are recorded so the pending list stays
 * accurate, but the capability is never executed.
 */
export const verifyApprovalResponses = async (
	messages: UIMessage[],
	lookup: ApprovalLookup,
	orgId: string,
	conversationId: string,
): Promise<void> => {
	const seen = new Set<string>();
	const pending: {
		part: UIMessage["parts"][number];
		toolCallId: string;
		approved: boolean;
	}[] = [];

	// Validate the whole request before claiming anything: a later tampered
	// part must not leave earlier proposals stuck as approved with no way to
	// retry them.
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
					ApiErrorCode.AI_APPROVAL_NOT_FOUND,
					`No pending approval found for tool call ${part.toolCallId}.`,
				);
			}

			// Retried requests can replay an approval response after the first
			// request already recorded it. Force a denial so the AI SDK cannot
			// execute the write twice (or execute a rejected/tampered replay).
			if (stored.status !== "proposed") {
				forceDenial(part);
				continue;
			}

			const submittedToolName = getToolName(part);
			if (submittedToolName !== stored.toolName) {
				throw new ApiError(
					ApiErrorCode.AI_APPROVAL_NOT_FOUND,
					`The approved tool ${submittedToolName} does not match the proposed action.`,
				);
			}

			const input = "input" in part ? part.input : undefined;
			if (stored.inputHash) {
				const submittedHash = await sha256Hex(JSON.stringify(input ?? null));
				if (submittedHash !== stored.inputHash) {
					throw new ApiError(
						ApiErrorCode.AI_APPROVAL_NOT_FOUND,
						`The approved input for tool call ${part.toolCallId} does not match the proposed action.`,
					);
				}
			}

			pending.push({
				part,
				toolCallId: part.toolCallId,
				approved: part.approval?.approved === true,
			});
		}
	}

	for (const item of pending) {
		const claimed = await lookup.claimProposedStatus(
			orgId,
			conversationId,
			item.toolCallId,
			item.approved ? "approved" : "rejected",
		);
		if (!claimed) forceDenial(item.part);
	}
};

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
