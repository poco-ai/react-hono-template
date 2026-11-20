import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { loadAppSession } from "@/features/auth/data";

export const Route = createFileRoute("/_auth")({
	beforeLoad: async ({ context, location }) => {
		const session = await loadAppSession(context.queryClient);
		if (!session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}
		return { session };
	},
	component: () => <Outlet />,
});
