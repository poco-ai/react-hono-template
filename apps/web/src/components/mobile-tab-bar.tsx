import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/data";
import { unreadCountQuery } from "@/features/notifications/data";
import { mergeMobileTabs } from "@/features/registry";
import type { MobileTabItem } from "@/features/web-types";

const TAB_BASE_CLASS =
	"text-muted-foreground relative flex flex-1 flex-col items-center justify-center gap-1 text-xs";
const TAB_ACTIVE_CLASS =
	"text-foreground font-medium before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-primary";

/** Shell-owned bottom tabs; feature tabs arrive from `features/registry.ts`. */
const CORE_MOBILE_TABS: readonly MobileTabItem[] = [];

/**
 * Mobile-only bottom navigation for the org layout (`md:hidden`). Features
 * contribute the high-frequency destinations (inbox, my issues, projects, AI);
 * everything else stays in the sidebar sheet.
 */
export function MobileTabBar() {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const { data: session } = useSession();
	const unread = useQuery({
		...unreadCountQuery(orgId),
		// Mirror the org layout gate: never poll the inbox for signed-out
		// or org-less visitors.
		enabled: Boolean(orgId) && Boolean(session),
	});
	const unreadCount = unread.data?.unread ?? 0;
	const tabs = mergeMobileTabs(CORE_MOBILE_TABS);

	return (
		<nav
			aria-label={t("nav.mobileNav")}
			className="bg-background fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
		>
			<div className="flex h-14 items-stretch justify-around">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<Link
							key={tab.id}
							to={tab.to}
							params={{ orgId }}
							search={tab.search as never}
							activeOptions={{
								exact: tab.exact ?? false,
								includeSearch: false,
							}}
							activeProps={{ className: TAB_ACTIVE_CLASS }}
							className={TAB_BASE_CLASS}
						>
							<span className="relative">
								<Icon className="size-5" />
								{tab.badge === "unread" && unreadCount > 0 ? (
									<span className="bg-primary text-primary-foreground absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium">
										{unreadCount > 99 ? "99+" : unreadCount}
									</span>
								) : null}
							</span>
							<span>{t(tab.labelKey)}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
