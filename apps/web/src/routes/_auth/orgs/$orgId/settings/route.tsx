import {
	createFileRoute,
	Link,
	Outlet,
	useParams,
} from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CORE_SETTINGS_NAV } from "@/components/org-settings-nav";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { mergeSettingsNav } from "@/features/registry";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings")({
	component: SettingsLayout,
});

function SettingsLayout() {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId/settings" });
	const { canManage } = useOrgRole(orgId);

	// Core tabs + feature tabs (`ai`, `api-keys`, `mcp`, `webhooks`, `billing`)
	// in the historical order; the manage gate stays a per-item flag.
	const links = mergeSettingsNav(CORE_SETTINGS_NAV).filter(
		(link) => !link.requiresManage || canManage,
	);

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-8">
			<nav className="flex gap-1 overflow-x-auto pb-8">
				{links.map((link) => (
					<Link
						key={link.id}
						to={link.to}
						params={{ orgId }}
						activeOptions={{ exact: link.exact ?? false }}
						className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
						activeProps={{
							className: "bg-accent text-foreground font-medium",
						}}
					>
						{t(link.labelKey)}
					</Link>
				))}
				{/* The docs page lives outside the settings layout, so a plain anchor opens it in a new tab. */}
				<a
					href="/api-docs"
					target="_blank"
					rel="noreferrer"
					className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
				>
					{t("apiDocs.title")}
					<ExternalLink className="size-3.5" />
				</a>
			</nav>
			<Outlet />
		</div>
	);
}
