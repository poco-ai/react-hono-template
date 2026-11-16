import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { VerifyEmail } from "@/components/auth/verify-email";

const EMAIL_STORAGE_KEY = "better-auth-ui.verify-email";

export const Route = createFileRoute("/verify-email")({
	validateSearch: z.object({ email: z.string().optional() }),
	component: VerifyEmailRoute,
});

function VerifyEmailRoute() {
	const { email } = Route.useSearch();
	const [ready, setReady] = useState(!email);

	useEffect(() => {
		if (!email) {
			setReady(true);
			return;
		}
		sessionStorage.setItem(EMAIL_STORAGE_KEY, email);
		setReady(true);
		return () => sessionStorage.removeItem(EMAIL_STORAGE_KEY);
	}, [email]);

	if (!ready) return null;
	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<VerifyEmail />
		</div>
	);
}
