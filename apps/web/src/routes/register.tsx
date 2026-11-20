import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadAppSession } from "@/features/auth/data";
import { RegisterPage } from "@/pages/register";

export const Route = createFileRoute("/register")({
	beforeLoad: async ({ context }) => {
		const session = await loadAppSession(context.queryClient);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	component: RegisterPage,
});
