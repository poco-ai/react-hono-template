import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionOptions } from "@/lib/session";
import { RegisterPage } from "@/pages/register";

export const Route = createFileRoute("/register")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	component: RegisterPage,
});
