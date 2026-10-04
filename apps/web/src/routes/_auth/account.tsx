import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AccountPage } from "@/pages/account";

export const Route = createFileRoute("/_auth/account")({
	component: () => (
		<AppLayout>
			<AccountPage />
		</AppLayout>
	),
});
