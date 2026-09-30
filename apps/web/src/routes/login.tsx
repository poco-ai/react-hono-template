import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionOptions } from "@/features/auth/data";
import { loginSearchSchema } from "@/features/auth/search";
import { LoginPage } from "@/pages/login";

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	validateSearch: loginSearchSchema,
	component: LoginPage,
});
