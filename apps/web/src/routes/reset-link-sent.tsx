import { createFileRoute } from "@tanstack/react-router";
import { ResetLinkSentPage } from "@/pages/reset-link-sent";

export const Route = createFileRoute("/reset-link-sent")({
	component: ResetLinkSentPage,
});
