import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/pages/home";

export const Route = createFileRoute("/_auth/")({
	component: HomePage,
});
