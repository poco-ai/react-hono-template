import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionOptions } from "@/features/auth/data";
import { loginSearchSchema } from "@/features/auth/search";
import { EmailOtpPage } from "@/pages/email-otp";

export const Route = createFileRoute("/email-otp")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	validateSearch: loginSearchSchema,
	component: EmailOtpPage,
});
