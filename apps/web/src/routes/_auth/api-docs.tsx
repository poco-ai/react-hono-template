import { createFileRoute } from "@tanstack/react-router";
import { ApiDocsPage } from "@/pages/api-docs";

export const Route = createFileRoute("/_auth/api-docs")({
	component: ApiDocsPage,
});
