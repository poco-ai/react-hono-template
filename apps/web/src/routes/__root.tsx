import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	type ErrorComponentProps,
	Link,
	Outlet,
	useRouter,
} from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Toaster } from "@workspace/ui/components/sonner";
import { useTranslation } from "react-i18next";
import { NotFoundState } from "@/components/not-found-state";
import { useTheme } from "@/components/theme-provider";

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

function RootError({ error, reset }: ErrorComponentProps) {
	const { t } = useTranslation();
	const router = useRouter();

	console.error(error);

	return (
		<NotFoundState
			title={t("error.title")}
			description={t("error.description")}
			action={
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							router.invalidate();
							reset();
						}}
					>
						{t("error.retry")}
					</Button>
					<Link
						to="/"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						{t("notFound.backHome")}
					</Link>
				</div>
			}
		/>
	);
}

function RootComponent() {
	const { theme } = useTheme();
	return (
		<>
			<Toaster theme={theme} />
			<Outlet />
		</>
	);
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	notFoundComponent: NotFound,
	errorComponent: RootError,
});
