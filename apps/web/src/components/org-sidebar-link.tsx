import { Link } from "@tanstack/react-router";
import {
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	ORG_SIDEBAR_NAV,
	type OrgSidebarNavContext,
	type OrgSidebarNavTo,
} from "./org-sidebar-nav";

export const ACTIVE_ITEM_CLASS =
	"bg-sidebar-accent text-sidebar-accent-foreground font-medium";

export function OrgSidebarLink({
	to,
	params,
	exact,
	tooltip,
	onNavigate,
	badge,
	children,
}: {
	to: OrgSidebarNavTo;
	params: { orgId: string };
	exact?: boolean;
	tooltip?: string;
	onNavigate?: () => void;
	/** Optional trailing badge rendered next to the menu button. */
	badge?: ReactNode;
	children: ReactNode;
}) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				tooltip={tooltip}
				render={
					<Link
						to={to}
						params={params}
						activeOptions={{ exact }}
						onClick={onNavigate}
						activeProps={{
							className: ACTIVE_ITEM_CLASS,
						}}
					/>
				}
			>
				{children}
			</SidebarMenuButton>
			{badge}
		</SidebarMenuItem>
	);
}

/** Renders the data-driven workspace navigation for the current org. */
export function OrgSidebarNavList({
	orgId,
	collapsed,
	unreadCount,
	onNavigate,
}: OrgSidebarNavContext & { orgId: string; onNavigate?: () => void }) {
	const { t } = useTranslation();
	const context: OrgSidebarNavContext = { collapsed, unreadCount };

	return (
		<>
			{ORG_SIDEBAR_NAV.filter((item) => item.when?.(context) ?? true).map(
				(item) => {
					const Icon = item.icon;
					return (
						<OrgSidebarLink
							key={item.id}
							to={item.to}
							params={item.params?.(orgId) ?? { orgId }}
							exact={item.exact}
							tooltip={t(item.labelKey)}
							onNavigate={onNavigate}
							badge={
								item.badge === "unread" && unreadCount > 0 ? (
									<SidebarMenuBadge>
										{unreadCount > 99 ? "99+" : unreadCount}
									</SidebarMenuBadge>
								) : undefined
							}
						>
							<Icon />
							<span>{t(item.labelKey)}</span>
						</OrgSidebarLink>
					);
				},
			)}
		</>
	);
}
