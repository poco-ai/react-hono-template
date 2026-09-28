import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/orgs/$orgId/")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/orgs/$orgId/projects", params });
	},
});
