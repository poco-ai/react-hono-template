import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { sessionOptions } from "@/lib/session";
import { LoginPage } from "@/pages/login";

const searchSchema = z.object({
	redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		if (session) {
			throw redirect({ to: "/" });
		}
	},
	validateSearch: searchSchema,
	component: LoginPage,
});
