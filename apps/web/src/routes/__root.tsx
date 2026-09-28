import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Link,
	Outlet,
} from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { useTranslation } from "react-i18next";
import { NotFoundState } from "@/components/not-found-state";

export interface RouterContext {
	queryClient: QueryClient;
}

function NotFound() {
	const { t } = useTranslation();
	return (
		<NotFoundState
			title={t("notFound.title")}
			action={
				<Link
					to="/"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					{t("notFound.backHome")}
				</Link>
			}
		/>
	);
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => <Outlet />,
	notFoundComponent: NotFound,
});
