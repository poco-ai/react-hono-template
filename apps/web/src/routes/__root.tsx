import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => <Outlet />,
	notFoundComponent: () => (
		<div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
			404 — Page not found.
		</div>
	),
});
