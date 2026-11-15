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
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { Search, Snowflake, SquarePen } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommandPalette } from "@/components/command-palette";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { ConversationRow } from "@/components/org-conversation-row";
import { OrgSidebarHeader } from "@/components/org-sidebar-header";
import { OrgSidebarNavList } from "@/components/org-sidebar-link";
import { OrgSidebarProjects } from "@/components/org-sidebar-projects";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { AiChatProvider, useAiChat } from "@/features/ai/chat-provider";
import { AiChatPanel } from "@/features/ai/components/chat-panel";
import { useSession } from "@/features/auth/data";
import type { OrgRole } from "@/features/members/data";
import { unreadCountQuery } from "@/features/notifications/data";
import { ActiveOrganizationSync } from "@/features/organizations/active-organization";
import { orgsQuery } from "@/features/organizations/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { projectsQuery } from "@/features/projects/data";
import { APP_HOTKEYS, isHotkeyBlocked } from "@/lib/hotkeys";

function OrgSidebarContent({ onOpenCommand }: { onOpenCommand?: () => void }) {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const navigate = useNavigate();
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
	const { newChat, conversations } = useAiChat();
	// `state` tracks the desktop rail; the mobile Sheet always renders full content.
	const collapsed = state === "collapsed" && !isMobile;

	const onNavigate = () => {
		if (isMobile) setOpenMobile(false);
	};
	const onNewChat = () => {
		newChat();
		void navigate({ to: "/orgs/$orgId/ai", params: { orgId } });
		onNavigate();
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
	const conversationItems = conversations.data?.items ?? [];
	const pinnedConversations = conversationItems
		.filter((conversation) => conversation.pinned)
		.slice(0, 3);
	const recentConversations = conversationItems
		.filter(
			(conversation) =>
				!conversation.pinned &&
				!(conversation.contextType === "project" && conversation.contextId),
		)
		.slice(0, 3);
	const projectConversations = currentProject
		? conversationItems
				.filter(
					(conversation) =>
						!conversation.pinned &&
						conversation.contextType === "project" &&
						conversation.contextId === currentProject.id,
				)
				.slice(0, 3)
		: [];

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
				<SidebarGroup>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton onClick={onNewChat} tooltip={t("ai.newChat")}>
								<SquarePen />
								<span className="flex-1 text-left">{t("ai.newChat")}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
					{!collapsed && pinnedConversations.length > 0 ? (
						<>
							<SidebarGroupLabel>
								{t("ai.conversations.pinned")}
							</SidebarGroupLabel>
							<SidebarMenu>
								{pinnedConversations.map((conversation) => (
									<ConversationRow
										key={conversation.id}
										orgId={orgId}
										conversation={conversation}
										onNavigate={onNavigate}
									/>
								))}
							</SidebarMenu>
						</>
					) : null}
					{!collapsed && recentConversations.length > 0 ? (
						<SidebarMenu>
							{recentConversations.map((conversation) => (
								<ConversationRow
									key={conversation.id}
									orgId={orgId}
									conversation={conversation}
									onNavigate={onNavigate}
								/>
							))}
						</SidebarMenu>
					) : null}
				</SidebarGroup>
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
						projectConversations={projectConversations}
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

export function OrgLayout() {
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });

	return (
		<AiChatProvider key={orgId} orgId={orgId}>
			<OrgLayoutContent orgId={orgId} />
		</AiChatProvider>
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
			<AiChatPanel />
			<MobileTabBar />
			<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
		</SidebarProvider>
	);
}
