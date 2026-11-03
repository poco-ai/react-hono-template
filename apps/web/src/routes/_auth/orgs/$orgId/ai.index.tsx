import { createFileRoute } from "@tanstack/react-router";
import { AiChatPage } from "@/features/ai/components/chat-page";

export const Route = createFileRoute("/_auth/orgs/$orgId/ai/")({
	component: AiIndexRoute,
});

function AiIndexRoute() {
	return <AiChatPage />;
}
