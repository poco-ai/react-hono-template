import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionOptions } from "@/features/auth/data";
import { resetPasswordSearchSchema } from "@/features/auth/search";
import { ResetPasswordPage } from "@/pages/reset-password";

export const Route = createFileRoute("/reset-password")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	validateSearch: resetPasswordSearchSchema,
	component: ResetPasswordPage,
});
