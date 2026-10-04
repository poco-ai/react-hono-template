import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionOptions } from "@/features/auth/data";
import { ForgotPasswordPage } from "@/pages/forgot-password";

export const Route = createFileRoute("/forgot-password")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	component: ForgotPasswordPage,
});
