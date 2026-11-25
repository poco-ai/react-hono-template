import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotFoundState } from "@/components/not-found-state";
import { PlatformLayout } from "@/components/platform-layout";

function AccessDenied() {
	const { t } = useTranslation();
	return (
		<NotFoundState
			icon={ShieldOff}
			title={t("admin.forbiddenTitle")}
			description={t("admin.forbiddenDescription")}
			action={
				<Link
					to="/"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					{t("nav.backToApp")}
				</Link>
			}
		/>
	);
}

export const Route = createFileRoute("/_auth/admin")({
	component: () => {
		const { session } = Route.useRouteContext();
		return (
			<PlatformLayout>
				{session.user.role === "admin" ? <Outlet /> : <AccessDenied />}
			</PlatformLayout>
		);
	},
});
