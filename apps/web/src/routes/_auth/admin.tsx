import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";

export const Route = createFileRoute("/_auth/admin")({
	beforeLoad: ({ context }) => {
		if (context.session.user.role !== "admin") {
			throw redirect({ to: "/" });
		}
	},
	component: () => (
		<AppLayout>
			<Outlet />
		</AppLayout>
	),
});
