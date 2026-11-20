import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadAppSession } from "@/features/auth/data";
import { ForgotPasswordPage } from "@/pages/forgot-password";

export const Route = createFileRoute("/forgot-password")({
	beforeLoad: async ({ context }) => {
		const session = await loadAppSession(context.queryClient);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	component: ForgotPasswordPage,
});
