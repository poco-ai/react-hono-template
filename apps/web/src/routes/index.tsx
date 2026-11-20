import { createFileRoute } from "@tanstack/react-router";
import { loadAppSession } from "@/features/auth/data";
import { HomePage } from "@/pages/home";
import { LandingPage } from "@/pages/landing";

export const Route = createFileRoute("/")({
	beforeLoad: async ({ context }) => {
		const session = await loadAppSession(context.queryClient);
		return { session };
	},
	component: IndexRoute,
});

function IndexRoute() {
	const { session } = Route.useRouteContext();
	return session ? <HomePage /> : <LandingPage />;
}
