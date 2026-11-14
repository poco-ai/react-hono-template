import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Bell, FolderKanban, Inbox, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/data";
import { unreadCountQuery } from "@/features/notifications/data";

const TAB_BASE_CLASS =
	"text-muted-foreground relative flex flex-1 flex-col items-center justify-center gap-1 text-xs";
const TAB_ACTIVE_CLASS =
	"text-foreground font-medium before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-primary";

/**
 * Mobile-only bottom navigation for the org layout (`md:hidden`). Covers the
 * four high-frequency destinations; everything else stays in the sidebar sheet.
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

	return (
		<nav
			aria-label={t("nav.mobileNav")}
			className="bg-background fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
		>
			<div className="flex h-14 items-stretch justify-around">
				<Link
					to="/orgs/$orgId/inbox"
					params={{ orgId }}
					search={{ filter: "all" }}
					activeOptions={{ exact: true, includeSearch: false }}
					activeProps={{ className: TAB_ACTIVE_CLASS }}
					className={TAB_BASE_CLASS}
				>
					<span className="relative">
						<Bell className="size-5" />
						{unreadCount > 0 ? (
							<span className="bg-primary text-primary-foreground absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium">
								{unreadCount > 99 ? "99+" : unreadCount}
							</span>
						) : null}
					</span>
					<span>{t("nav.inbox")}</span>
				</Link>
				<Link
					to="/orgs/$orgId/my-issues"
					params={{ orgId }}
					activeOptions={{ exact: true, includeSearch: false }}
					activeProps={{ className: TAB_ACTIVE_CLASS }}
					className={TAB_BASE_CLASS}
				>
					<Inbox className="size-5" />
					<span>{t("nav.myIssues")}</span>
				</Link>
				<Link
					to="/orgs/$orgId/projects"
					params={{ orgId }}
					activeOptions={{ includeSearch: false }}
					activeProps={{ className: TAB_ACTIVE_CLASS }}
					className={TAB_BASE_CLASS}
				>
					<FolderKanban className="size-5" />
					<span>{t("nav.projects")}</span>
				</Link>
				<Link
					to="/orgs/$orgId/ai"
					params={{ orgId }}
					activeOptions={{ exact: false, includeSearch: false }}
					activeProps={{ className: TAB_ACTIVE_CLASS }}
					className={TAB_BASE_CLASS}
				>
					<Sparkles className="size-5" />
					<span>{t("nav.ai")}</span>
				</Link>
			</div>
		</nav>
	);
}
