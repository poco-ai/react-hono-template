import { createFileRoute } from "@tanstack/react-router";
import { AiChatPage } from "@/features/ai/components/chat-page";

export const Route = createFileRoute("/_auth/orgs/$orgId/ai/$conversationId")({
	component: AiConversationRoute,
});

function AiConversationRoute() {
	const { conversationId } = Route.useParams();
	return <AiChatPage conversationId={conversationId} />;
}
