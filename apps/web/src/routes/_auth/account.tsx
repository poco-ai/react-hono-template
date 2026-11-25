import { createFileRoute } from "@tanstack/react-router";
import { PlatformLayout } from "@/components/platform-layout";
import { AccountPage } from "@/pages/account";

export const Route = createFileRoute("/_auth/account")({
	component: () => (
		<PlatformLayout>
			<AccountPage />
		</PlatformLayout>
	),
});
