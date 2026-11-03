import { useChat } from "@ai-sdk/react";
import type {
	AiContextSnapshot,
	AiConversationDto,
	AiConversationListDto,
	AiUsageSummaryDto,
} from "@api/dto/ai.dto";
import {
	type UseQueryResult,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMatchRoute } from "@tanstack/react-router";
import type { ChatStatus, UIMessage } from "ai";
import {
	getToolName,
	isDynamicToolUIPart,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import {
	createContext,
	type ReactNode,
	type Ref,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type AiChatContextInput,
	aiConversationDetailQuery,
	aiConversationListQuery,
	aiErrorCode,
	aiTimezone,
	aiUsageQuery,
	createAiChatTransport,
	invalidateAiConversationQueries,
	toUIMessage,
	useCreateAiConversation,
} from "@/features/ai/data";
import { issueQuery } from "@/features/issues/data";
import { projectsQuery } from "@/features/projects/data";

const PANEL_STORAGE_PREFIX = "ai:panel:";

export type AiAvailability = "loading" | "ready" | "disabled" | "unconfigured";

type ChatRuntimeState = {
	conversationId: string | null;
	messages: UIMessage[];
	status: ChatStatus;
	error: Error | undefined;
};

const EMPTY_RUNTIME: ChatRuntimeState = {
	conversationId: null,
	messages: [],
	status: "ready",
	error: undefined,
};

export type AiPendingApproval = {
	toolCallId: string;
	approvalId: string;
	toolName: string;
	input: unknown;
};

export type AiAmbientContext = AiChatContextInput & { label?: string };

type ChatRuntimeHandle = {
	sendMessage: (text: string) => Promise<void>;
	stop: () => Promise<void>;
	addToolApprovalResponse: (args: {
		id: string;
		approved: boolean;
	}) => Promise<void>;
};

export type AiChatContextValue = {
	orgId: string;
	activeConversationId: string | null;
	activeConversation: AiConversationDto | null;
	conversationLoading: boolean;
	setActiveConversation: (id: string | null) => void;
	messages: UIMessage[];
	status: ChatStatus;
	streaming: boolean;
	error: Error | undefined;
	sendPrompt: (text: string) => Promise<string | null>;
	stop: () => void;
	addToolApprovalResponse: (args: { id: string; approved: boolean }) => void;
	pendingApprovals: AiPendingApproval[];
	conversations: UseQueryResult<AiConversationListDto>;
	usage: UseQueryResult<AiUsageSummaryDto>;
	usagePercent: number;
	availability: AiAvailability;
	panelOpen: boolean;
	setPanelOpen: (open: boolean) => void;
	togglePanel: () => void;
	newChat: () => void;
	/** Project/issue context of the current route (used by the side panel). */
	ambientContext: AiAmbientContext | null;
	/** Friendly label for the route context, even while its id still loads. */
	ambientContextLabel: string | null;
	/** Context stored on the active conversation (used by the `/ai` page). */
	conversationContext: AiContextSnapshot | null;
};

const AiChatContext = createContext<AiChatContextValue | null>(null);

function readPanelState(orgId: string): boolean {
	try {
		return localStorage.getItem(`${PANEL_STORAGE_PREFIX}${orgId}`) === "1";
	} catch {
		return false;
	}
}

function writePanelState(orgId: string, open: boolean): void {
	try {
		localStorage.setItem(`${PANEL_STORAGE_PREFIX}${orgId}`, open ? "1" : "0");
	} catch {
		// ignore unavailable storage (private mode)
	}
}

function pendingApprovalsOf(messages: UIMessage[]): AiPendingApproval[] {
	const approvals: AiPendingApproval[] = [];
	for (const message of messages) {
		for (const part of message.parts) {
			if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) {
				continue;
			}
			if (part.state !== "approval-requested") {
				continue;
			}
			approvals.push({
				toolCallId: part.toolCallId,
				approvalId: part.approval.id,
				toolName: getToolName(part),
				input: "input" in part ? part.input : undefined,
			});
		}
	}
	return approvals;
}

function ChatRuntime({
	ref,
	conversationId,
	initialMessages,
	transport,
	pendingPrompt,
	onStateChange,
	onSettled,
}: {
	ref?: Ref<ChatRuntimeHandle>;
	conversationId: string | null;
	initialMessages: UIMessage[];
	transport: ReturnType<typeof createAiChatTransport>;
	pendingPrompt: () => string | null;
	onStateChange: (
		conversationId: string | null,
		state: ChatRuntimeState,
	) => void;
	onSettled: () => void;
}) {
	const chat = useChat<UIMessage>({
		id: conversationId ?? "new",
		messages: initialMessages,
		transport,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
		onFinish: () => onSettled(),
		onError: () => onSettled(),
	});

	useImperativeHandle(
		ref,
		() => ({
			sendMessage: (text: string) => chat.sendMessage({ text }),
			stop: () => chat.stop(),
			addToolApprovalResponse: async (args) => {
				await chat.addToolApprovalResponse(args);
			},
		}),
		[chat],
	);

	const { messages, status, error } = chat;
	useEffect(() => {
		onStateChange(conversationId, { conversationId, messages, status, error });
	}, [conversationId, messages, status, error, onStateChange]);

	// A prompt typed before the conversation existed is flushed once the
	// (re)keyed runtime has the empty conversation loaded. The timeout keeps
	// StrictMode's effect replay from sending twice.
	const consumedRef = useRef(false);
	useEffect(() => {
		if (consumedRef.current) {
			return;
		}
		const timer = window.setTimeout(() => {
			consumedRef.current = true;
			const prompt = pendingPrompt();
			if (prompt) {
				void chat.sendMessage({ text: prompt });
			}
		}, 0);
		return () => window.clearTimeout(timer);
	}, [chat, pendingPrompt]);

	return null;
}

export function AiChatProvider({
	orgId,
	children,
}: {
	orgId: string;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const matchRoute = useMatchRoute();

	const [activeConversationId, setActiveConversationId] = useState<
		string | null
	>(null);
	const [runtimeState, setRuntimeState] =
		useState<ChatRuntimeState>(EMPTY_RUNTIME);
	const [panelOpen, setPanelOpenState] = useState(() => readPanelState(orgId));
	const runtimeRef = useRef<ChatRuntimeHandle>(null);
	const pendingPromptRef = useRef<string | null>(null);

	const conversations = useQuery(aiConversationListQuery(orgId));
	const usage = useQuery(aiUsageQuery(orgId));
	const detailQuery = useQuery({
		...aiConversationDetailQuery(orgId, activeConversationId ?? ""),
		enabled: activeConversationId !== null,
	});
	const createConversation = useCreateAiConversation(orgId);

	// ---------------------------------------------------------------------
	// Ambient context from the current route (panel); the `/ai` page relies on
	// the conversation's stored context instead.
	// ---------------------------------------------------------------------
	const projectMatch = matchRoute({
		to: "/orgs/$orgId/projects/$projectId",
		includeSearch: false,
	});
	const issueMatch = matchRoute({
		to: "/orgs/$orgId/projects/$projectId/$issueNumber",
		includeSearch: false,
	});
	const aiIndexMatch = matchRoute({ to: "/orgs/$orgId/ai" });
	const aiConversationMatch = matchRoute({
		to: "/orgs/$orgId/ai/$conversationId",
	});
	const onAiRoute = Boolean(aiIndexMatch) || Boolean(aiConversationMatch);

	const issueProjectId = issueMatch ? issueMatch.projectId : undefined;
	const issueNumber = issueMatch ? Number(issueMatch.issueNumber) : 0;
	const issue = useQuery({
		...issueQuery(orgId, issueProjectId ?? "", issueNumber),
		enabled:
			issueProjectId !== undefined &&
			Number.isInteger(issueNumber) &&
			issueNumber > 0,
	});
	const projects = useQuery({
		...projectsQuery(orgId),
		enabled: projectMatch !== false || issueProjectId !== undefined,
	});

	const ambientContext = useMemo<AiAmbientContext | null>(() => {
		if (issueMatch) {
			if (!issue.data) {
				return null;
			}
			return {
				type: "issue",
				id: issue.data.id,
				label: `#${issue.data.number} ${issue.data.title}`,
			};
		}
		if (projectMatch !== false && projectMatch.projectId) {
			const project = (projects.data ?? []).find(
				(entry) => entry.id === projectMatch.projectId,
			);
			return {
				type: "project",
				id: projectMatch.projectId,
				label: project ? `${project.key} ${project.name}` : undefined,
			};
		}
		return null;
	}, [issueMatch, issue.data, projectMatch, projects.data]);

	// The chip should show something while the route context is still resolving.
	const ambientContextLabel = useMemo(() => {
		if (issueMatch) {
			return issue.data
				? `#${issue.data.number} ${issue.data.title}`
				: `#${issueMatch.issueNumber}`;
		}
		if (projectMatch) {
			return (
				(projects.data ?? []).find(
					(entry) => entry.id === projectMatch.projectId,
				)?.name ?? null
			);
		}
		return null;
	}, [issueMatch, issue.data, projectMatch, projects.data]);

	// ---------------------------------------------------------------------
	// Conversation detail / context
	// ---------------------------------------------------------------------
	const detail = detailQuery.data;
	const detailReady = activeConversationId === null || detail !== undefined;
	const initialMessages = useMemo(
		() => detail?.messages.map(toUIMessage) ?? [],
		[detail],
	);

	const conversationContext = useMemo<AiContextSnapshot | null>(() => {
		if (!detail) {
			return null;
		}
		for (let index = detail.messages.length - 1; index >= 0; index -= 1) {
			const context = detail.messages[index].context;
			if (context) {
				return context;
			}
		}
		const { conversation } = detail;
		if (conversation.contextType && conversation.contextId) {
			return {
				type: conversation.contextType as AiContextSnapshot["type"],
				id: conversation.contextId,
			};
		}
		return null;
	}, [detail]);

	// ---------------------------------------------------------------------
	// Transport (rebuilt when the conversation or ambient context changes)
	// ---------------------------------------------------------------------
	const transport = useMemo(
		() =>
			createAiChatTransport({
				orgId,
				conversationId: activeConversationId ?? "",
				context: ambientContext,
				timezone: aiTimezone(),
			}),
		[orgId, activeConversationId, ambientContext],
	);

	const onSettled = useCallback(() => {
		void invalidateAiConversationQueries(
			queryClient,
			orgId,
			activeConversationId ?? undefined,
		);
	}, [queryClient, orgId, activeConversationId]);

	const onRuntimeState = useCallback(
		(_conversationId: string | null, state: ChatRuntimeState) => {
			setRuntimeState(state);
		},
		[],
	);

	const consumePendingPrompt = useCallback(() => {
		const prompt = pendingPromptRef.current;
		pendingPromptRef.current = null;
		return prompt;
	}, []);

	// A failed detail fetch leaves the pending prompt unsent; discard it.
	useEffect(() => {
		if (detailQuery.isError) {
			pendingPromptRef.current = null;
		}
	}, [detailQuery.isError]);

	const setActiveConversation = useCallback((id: string | null) => {
		pendingPromptRef.current = null;
		setActiveConversationId(id);
	}, []);

	const newChat = useCallback(() => {
		pendingPromptRef.current = null;
		setActiveConversationId(null);
	}, []);

	// ---------------------------------------------------------------------
	// Panel state (per-org, persisted; Cmd/Ctrl+J toggles)
	// ---------------------------------------------------------------------
	const orgRef = useRef(orgId);
	useEffect(() => {
		if (orgRef.current === orgId) {
			return;
		}
		orgRef.current = orgId;
		pendingPromptRef.current = null;
		setActiveConversationId(null);
		setRuntimeState(EMPTY_RUNTIME);
		setPanelOpenState(readPanelState(orgId));
	}, [orgId]);

	const setPanelOpen = useCallback(
		(open: boolean) => {
			setPanelOpenState(open);
			writePanelState(orgId, open);
		},
		[orgId],
	);

	const togglePanel = useCallback(() => {
		setPanelOpenState((previous) => {
			const next = !previous;
			writePanelState(orgId, next);
			return next;
		});
	}, [orgId]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				event.key.toLowerCase() === "j"
			) {
				event.preventDefault();
				if (!onAiRoute) {
					togglePanel();
				}
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [togglePanel, onAiRoute]);

	// ---------------------------------------------------------------------
	// Availability / usage
	// ---------------------------------------------------------------------
	const availability = useMemo<AiAvailability>(() => {
		if (usage.isPending) {
			return "loading";
		}
		if (!usage.data) {
			return aiErrorCode(usage.error) === "AI_DISABLED" ? "disabled" : "ready";
		}
		if (!usage.data.enabled) {
			return "disabled";
		}
		return usage.data.provider.configured ? "ready" : "unconfigured";
	}, [usage.isPending, usage.data, usage.error]);

	const usagePercent = useMemo(() => {
		if (!usage.data || usage.data.limits.monthlyTokens <= 0) {
			return 0;
		}
		return Math.min(
			100,
			Math.round(
				(usage.data.totalTokens / usage.data.limits.monthlyTokens) * 100,
			),
		);
	}, [usage.data]);

	// ---------------------------------------------------------------------
	// Runtime bridge
	// ---------------------------------------------------------------------
	const sendPrompt = useCallback(
		async (text: string): Promise<string | null> => {
			const prompt = text.trim();
			if (
				!prompt ||
				availability === "disabled" ||
				availability === "unconfigured"
			) {
				return null;
			}

			if (activeConversationId) {
				const runtime = runtimeRef.current;
				if (!runtime) {
					return null;
				}
				await runtime.sendMessage(prompt);
				return activeConversationId;
			}

			if (createConversation.isPending) {
				return null;
			}

			pendingPromptRef.current = prompt;
			try {
				const conversation = await createConversation.mutateAsync(
					ambientContext
						? { contextType: ambientContext.type, contextId: ambientContext.id }
						: {},
				);
				setActiveConversationId(conversation.id);
				return conversation.id;
			} catch {
				pendingPromptRef.current = null;
				return null;
			}
		},
		[activeConversationId, ambientContext, availability, createConversation],
	);

	const stop = useCallback(() => {
		void runtimeRef.current?.stop();
	}, []);

	const addToolApprovalResponse = useCallback(
		(args: { id: string; approved: boolean }) => {
			void runtimeRef.current?.addToolApprovalResponse(args);
		},
		[],
	);

	const activeRuntime = runtimeState.conversationId === activeConversationId;
	const messages = detailReady
		? activeRuntime
			? runtimeState.messages
			: initialMessages
		: [];
	const status = activeRuntime ? runtimeState.status : "ready";
	const error =
		(activeRuntime ? runtimeState.error : undefined) ??
		createConversation.error ??
		(activeConversationId && detailQuery.isError
			? (detailQuery.error as Error)
			: undefined) ??
		undefined;

	const pendingApprovals = useMemo(
		() => pendingApprovalsOf(messages),
		[messages],
	);

	const value = useMemo<AiChatContextValue>(
		() => ({
			orgId,
			activeConversationId,
			activeConversation: detail?.conversation ?? null,
			conversationLoading:
				activeConversationId !== null && detailQuery.isPending,
			setActiveConversation,
			messages,
			status,
			streaming: status === "submitted" || status === "streaming",
			error,
			sendPrompt,
			stop,
			addToolApprovalResponse,
			pendingApprovals,
			conversations,
			usage,
			usagePercent,
			availability,
			panelOpen,
			setPanelOpen,
			togglePanel,
			newChat,
			ambientContext,
			ambientContextLabel,
			conversationContext,
		}),
		[
			orgId,
			activeConversationId,
			detail,
			detailQuery.isPending,
			setActiveConversation,
			messages,
			status,
			error,
			sendPrompt,
			stop,
			addToolApprovalResponse,
			pendingApprovals,
			conversations,
			usage,
			usagePercent,
			availability,
			panelOpen,
			setPanelOpen,
			togglePanel,
			newChat,
			ambientContext,
			ambientContextLabel,
			conversationContext,
		],
	);

	return (
		<AiChatContext.Provider value={value}>
			{detailReady ? (
				<ChatRuntime
					key={activeConversationId ?? "new"}
					ref={runtimeRef}
					conversationId={activeConversationId}
					initialMessages={initialMessages}
					transport={transport}
					pendingPrompt={consumePendingPrompt}
					onStateChange={onRuntimeState}
					onSettled={onSettled}
				/>
			) : null}
			{children}
		</AiChatContext.Provider>
	);
}

export function useAiChat(): AiChatContextValue {
	const value = useContext(AiChatContext);
	if (!value) {
		throw new Error("useAiChat must be used within AiChatProvider");
	}
	return value;
}
