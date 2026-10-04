import { createFileRoute } from "@tanstack/react-router";
import { sessionOptions } from "@/features/auth/data";
import { HomePage } from "@/pages/home";
import { LandingPage } from "@/pages/landing";

export const Route = createFileRoute("/")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		return { session };
	},
	component: IndexRoute,
});

function IndexRoute() {
	const { session } = Route.useRouteContext();
	return session ? <HomePage /> : <LandingPage />;
}
