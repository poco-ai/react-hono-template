import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app-layout";
import { NotFoundState } from "@/components/not-found-state";

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
			<AppLayout>
				{session.user.role === "admin" ? <Outlet /> : <AccessDenied />}
			</AppLayout>
		);
	},
});
