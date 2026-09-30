import {
	createFileRoute,
	Link,
	Outlet,
	useParams,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useOrgRole } from "@/features/organizations/use-org-role";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings")({
	component: SettingsLayout,
});

function SettingsLayout() {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId/settings" });
	const { canManage } = useOrgRole(orgId);

	const links = [
		{ to: "/orgs/$orgId/settings", label: t("settings.general"), exact: true },
		{ to: "/orgs/$orgId/settings/members", label: t("settings.members") },
		{ to: "/orgs/$orgId/settings/labels", label: t("settings.labels") },
		...(canManage
			? [
					{
						to: "/orgs/$orgId/settings/api-keys",
						label: t("settings.apiKeys"),
					},
					{
						to: "/orgs/$orgId/settings/webhooks",
						label: t("settings.webhooks"),
					},
					{ to: "/orgs/$orgId/settings/billing", label: t("settings.billing") },
				]
			: []),
	];

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-8">
			<nav className="flex gap-1 overflow-x-auto pb-8">
				{links.map((link) => (
					<Link
						key={link.to}
						to={link.to}
						params={{ orgId }}
						activeOptions={{ exact: link.exact ?? false }}
						className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
						activeProps={{
							className: "bg-accent text-foreground font-medium",
						}}
					>
						{link.label}
					</Link>
				))}
			</nav>
			<Outlet />
		</div>
	);
}
