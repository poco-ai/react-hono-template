import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import {
	Outlet,
	useMatchRoute,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { Search, Snowflake } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommandPalette } from "@/components/command-palette";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { OrgSidebarHeader } from "@/components/org-sidebar-header";
import { OrgSidebarNavList } from "@/components/org-sidebar-link";
import { OrgSidebarProjects } from "@/components/org-sidebar-projects";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { useSession } from "@/features/auth/data";
import type { OrgRole } from "@/features/members/data";
import { unreadCountQuery } from "@/features/notifications/data";
import { ActiveOrganizationSync } from "@/features/organizations/active-organization";
import { orgsQuery } from "@/features/organizations/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { projectsQuery } from "@/features/projects/data";
import {
	webPanels,
	webProviders,
	webSidebarSections,
} from "@/features/registry";
import { APP_HOTKEYS, isHotkeyBlocked } from "@/lib/hotkeys";

function OrgSidebarContent({ onOpenCommand }: { onOpenCommand?: () => void }) {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const { data: session } = useSession();
	const orgs = useQuery(orgsQuery());
	const projects = useQuery(projectsQuery(orgId));
	const unread = useQuery({
		...unreadCountQuery(orgId),
		// The layout can render before the session resolves; never poll the
		// inbox for signed-out or org-less visitors.
		enabled: Boolean(orgId) && Boolean(session),
	});
	const unreadCount = unread.data?.unread ?? 0;
	const { role } = useOrgRole(orgId);
	const { isMobile, setOpenMobile, state } = useSidebar();
	// `state` tracks the desktop rail; the mobile Sheet always renders full content.
	const collapsed = state === "collapsed" && !isMobile;
	const sidebarSections = webSidebarSections();

	const onNavigate = () => {
		if (isMobile) setOpenMobile(false);
	};

	const currentOrg = orgs.data?.find((org) => org.id === orgId);
	const activeProjects = (projects.data ?? []).filter(
		(project) => !project.archived,
	);
	const matchRoute = useMatchRoute();
	const projectMatch = matchRoute({
		to: "/orgs/$orgId/projects/$projectId",
	});
	const currentProject = projectMatch
		? activeProjects.find((project) => project.id === projectMatch.projectId)
		: undefined;

	return (
		<>
			<OrgSidebarHeader
				currentOrg={currentOrg}
				orgsPending={orgs.isPending}
				collapsed={collapsed}
				onOpenCommand={onOpenCommand}
				onNavigate={onNavigate}
			/>
			<SidebarContent>
				{sidebarSections.map((SidebarSection) => (
					<SidebarSection
						key={SidebarSection.displayName ?? SidebarSection.name}
						orgId={orgId}
						collapsed={collapsed}
						currentProjectId={currentProject?.id}
						onNavigate={onNavigate}
					/>
				))}
				<SidebarGroup>
					{!collapsed ? (
						<SidebarGroupLabel>{t("nav.workspace")}</SidebarGroupLabel>
					) : null}
					<SidebarMenu>
						<OrgSidebarNavList
							orgId={orgId}
							collapsed={collapsed}
							unreadCount={unreadCount}
							onNavigate={onNavigate}
						/>
					</SidebarMenu>
				</SidebarGroup>
				{!collapsed ? (
					<OrgSidebarProjects
						orgId={orgId}
						projects={activeProjects}
						pending={projects.isPending}
						currentProjectId={currentProject?.id}
						onNavigate={onNavigate}
					/>
				) : null}
			</SidebarContent>
			<SidebarFooter className={collapsed ? "items-center" : undefined}>
				{session && (
					<UserDropdown
						user={session.user}
						orgId={orgId}
						orgRole={role as OrgRole | undefined}
						size={collapsed ? "icon" : "default"}
						className={collapsed ? undefined : "w-full"}
					/>
				)}
			</SidebarFooter>
		</>
	);
}

/**
 * Mounts every provider contributed by an enabled feature, outermost first.
 * Only `ai` contributes one today; a trimmed registry returns an empty list
 * and the layout renders with zero wrappers.
 */
function OrgFeatureProviders({
	orgId,
	children,
}: {
	orgId: string;
	children: ReactNode;
}) {
	return webProviders().reduceRight<ReactNode>((child, provide) => {
		const Provider = provide(orgId);
		return <Provider key={orgId}>{child}</Provider>;
	}, children);
}

export function OrgLayout() {
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });

	return (
		<OrgFeatureProviders orgId={orgId}>
			<OrgLayoutContent orgId={orgId} />
		</OrgFeatureProviders>
	);
}

function readSidebarOpen() {
	if (typeof document === "undefined") return true;
	return !document.cookie
		.split("; ")
		.some((cookie) => cookie === "sidebar_state=false");
}

function OrgLayoutContent({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const orgs = useQuery(orgsQuery());
	const frozen = useOrgFrozen(orgId);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [defaultSidebarOpen] = useState(readSidebarOpen);

	useHotkeys([
		{
			hotkey: APP_HOTKEYS.navigateProjects.hotkey,
			callback: () => {
				if (isHotkeyBlocked()) return;
				void navigate({ to: "/orgs/$orgId/projects", params: { orgId } });
			},
		},
		{
			hotkey: APP_HOTKEYS.navigateMyIssues.hotkey,
			callback: () => {
				if (isHotkeyBlocked()) return;
				void navigate({ to: "/orgs/$orgId/my-issues", params: { orgId } });
			},
		},
		{
			hotkey: APP_HOTKEYS.navigateActivity.hotkey,
			callback: () => {
				if (isHotkeyBlocked()) return;
				void navigate({ to: "/orgs/$orgId/activity", params: { orgId } });
			},
		},
		{
			hotkey: APP_HOTKEYS.navigateSettings.hotkey,
			callback: () => {
				if (isHotkeyBlocked()) return;
				void navigate({ to: "/orgs/$orgId/settings", params: { orgId } });
			},
		},
	]);

	const currentOrg = orgs.data?.find((org) => org.id === orgId);

	return (
		<SidebarProvider
			defaultOpen={defaultSidebarOpen}
			style={{ "--sidebar-width": "15rem" } as CSSProperties}
		>
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:border focus:bg-background focus:p-3 focus:shadow-md"
			>
				{t("common.skipToContent")}
			</a>
			<Sidebar collapsible="icon">
				<OrgSidebarContent onOpenCommand={() => setPaletteOpen(true)} />
				<SidebarRail
					title={t("nav.toggleSidebar")}
					aria-label={t("nav.toggleSidebar")}
					className="max-md:hidden"
				/>
			</Sidebar>
			<div className="flex min-w-0 flex-1 flex-col max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
				<header className="bg-background sticky top-0 z-40 flex h-12 items-center gap-2 border-b px-3 md:hidden">
					<SidebarTrigger aria-label={t("nav.openMenu")} />
					<span className="min-w-0 flex-1 truncate text-sm font-medium">
						{currentOrg?.name ?? t("common.loading")}
					</span>
					<Button
						variant="ghost"
						size="icon"
						aria-label={t("nav.search")}
						onClick={() => setPaletteOpen(true)}
					>
						<Search />
					</Button>
					<ThemeToggle />
				</header>
				{frozen && (
					<Alert className="sticky top-12 z-30 rounded-none border-x-0 border-t-0 border-b-amber-500/30 bg-amber-500/10 px-4 py-2 font-medium text-amber-700 md:top-0 dark:text-amber-400">
						<Snowflake />
						<AlertDescription className="text-amber-700 dark:text-amber-400">
							{t("org.frozenBanner")}
						</AlertDescription>
					</Alert>
				)}
				<ActiveOrganizationSync orgId={orgId}>
					<main id="main-content" className="min-w-0 flex-1">
						<Outlet />
					</main>
				</ActiveOrganizationSync>
			</div>
			{webPanels().map((Panel) => (
				<Panel key={Panel.displayName ?? Panel.name} />
			))}
			<MobileTabBar />
			<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
		</SidebarProvider>
	);
}
