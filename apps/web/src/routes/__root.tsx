import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export interface RouterContext {
	queryClient: QueryClient;
}

function NotFound() {
	const { t } = useTranslation();
	return (
		<div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
			{t("notFound.message")}
		</div>
	);
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => <Outlet />,
	notFoundComponent: NotFound,
});
