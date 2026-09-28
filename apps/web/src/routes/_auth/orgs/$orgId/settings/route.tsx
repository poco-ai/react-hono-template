import {
	createFileRoute,
	Link,
	Outlet,
	useParams,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings")({
	component: SettingsLayout,
});

function SettingsLayout() {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId/settings" });

	return (
		<div className="mx-auto flex max-w-4xl gap-10 p-8">
			<nav className="flex w-40 shrink-0 flex-col gap-0.5">
				<Link
					to="/orgs/$orgId/settings"
					params={{ orgId }}
					activeOptions={{ exact: true }}
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 text-sm"
					activeProps={{
						className: "bg-accent text-foreground font-medium",
					}}
				>
					{t("settings.general")}
				</Link>
				<Link
					to="/orgs/$orgId/settings/members"
					params={{ orgId }}
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 text-sm"
					activeProps={{
						className: "bg-accent text-foreground font-medium",
					}}
				>
					{t("settings.members")}
				</Link>
				<Link
					to="/orgs/$orgId/settings/labels"
					params={{ orgId }}
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 text-sm"
					activeProps={{
						className: "bg-accent text-foreground font-medium",
					}}
				>
					{t("settings.labels")}
				</Link>
				<Link
					to="/orgs/$orgId/settings/api-keys"
					params={{ orgId }}
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 text-sm"
					activeProps={{
						className: "bg-accent text-foreground font-medium",
					}}
				>
					{t("settings.apiKeys")}
				</Link>
				<Link
					to="/orgs/$orgId/settings/webhooks"
					params={{ orgId }}
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 text-sm"
					activeProps={{
						className: "bg-accent text-foreground font-medium",
					}}
				>
					{t("settings.webhooks")}
				</Link>
				<Link
					to="/orgs/$orgId/settings/billing"
					params={{ orgId }}
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 text-sm"
					activeProps={{
						className: "bg-accent text-foreground font-medium",
					}}
				>
					{t("settings.billing")}
				</Link>
			</nav>
			<div className="min-w-0 flex-1">
				<h1 className="text-2xl font-semibold tracking-tight pb-8">
					{t("settings.title")}
				</h1>
				<Outlet />
			</div>
		</div>
	);
}
