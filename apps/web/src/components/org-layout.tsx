import { useQuery } from "@tanstack/react-query";
import {
	Link,
	Outlet,
	useMatchRoute,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { DropdownMenuTrigger } from "@workspace/ui/components/dropdown-menu";
import { Kbd } from "@workspace/ui/components/kbd";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import {
	Activity,
	ChevronRight,
	ChevronsUpDown,
	Inbox,
	MessageSquare,
	Plus,
	Search,
	Settings,
	Snowflake,
	Sparkles,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OrganizationSwitcher } from "@/components/auth/organization/organization-switcher";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { AiChatProvider, useAiChat } from "@/features/ai/chat-provider";
import { AiChatPanel } from "@/features/ai/components/chat-panel";
import { useSession } from "@/features/auth/data";
import type { OrgRole } from "@/features/members/data";
import { ActiveOrganizationSync } from "@/features/organizations/active-organization";
import { orgsQuery } from "@/features/organizations/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { projectsQuery } from "@/features/projects/data";
import { useHotkeys } from "@/lib/use-hotkeys";

const MAX_SIDEBAR_PROJECTS = 7;
const ACTIVE_ITEM_CLASS =
	"bg-sidebar-accent text-sidebar-accent-foreground font-medium";

function SidebarLink({
	to,
	exact,
	onNavigate,
	children,
}: {
	to:
		| "/orgs/$orgId/projects"
		| "/orgs/$orgId/my-issues"
		| "/orgs/$orgId/activity";
	exact?: boolean;
	onNavigate?: () => void;
	children: ReactNode;
}) {
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				render={
					<Link
						to={to}
						params={{ orgId }}
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
		</SidebarMenuItem>
	);
}

function OrgSidebarContent({ onOpenCommand }: { onOpenCommand?: () => void }) {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const navigate = useNavigate();
	const { data: session } = useSession();
	const orgs = useQuery(orgsQuery());
	const projects = useQuery(projectsQuery(orgId));
	const { role } = useOrgRole(orgId);
	const frozen = useOrgFrozen(orgId);
	const [createOpen, setCreateOpen] = useState(false);
	const [recentChatsOpen, setRecentChatsOpen] = useState(false);
	const { isMobile, setOpenMobile } = useSidebar();
	const { newChat, conversations } = useAiChat();

	const isMac = /mac|iphone|ipad/i.test(navigator.userAgent);
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
	const visibleProjects = activeProjects.slice(0, MAX_SIDEBAR_PROJECTS);
	const matchRoute = useMatchRoute();
	const projectMatch = matchRoute({
		to: "/orgs/$orgId/projects/$projectId",
	});
	const onConversationRoute = Boolean(
		matchRoute({ to: "/orgs/$orgId/ai/$conversationId" }),
	);
	useEffect(() => {
		if (onConversationRoute) setRecentChatsOpen(true);
	}, [onConversationRoute]);
	const currentProject = projectMatch
		? activeProjects.find((project) => project.id === projectMatch.projectId)
		: undefined;
	if (
		currentProject &&
		!visibleProjects.some((project) => project.id === currentProject.id)
	) {
		visibleProjects.push(currentProject);
	}
	// The conversation list is pinned-first; the header only appears once it has data.
	const recentConversations = conversations.data?.items.slice(0, 3) ?? [];

	return (
		<>
			<SidebarHeader>
				<div className="flex items-center gap-1">
					<OrganizationSwitcher
						align="start"
						hidePersonal
						hideSettings
						trigger={
							<DropdownMenuTrigger
								className={cn(
									buttonVariants({ variant: "ghost" }),
									"h-9 min-w-0 flex-1 justify-between px-2 text-left font-medium",
								)}
							>
								{currentOrg ? (
									<span className="min-w-0 truncate">{currentOrg.name}</span>
								) : (
									<Skeleton className="h-4 w-24" />
								)}
								<ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
							</DropdownMenuTrigger>
						}
						setActive={(organization) => {
							if (!organization) return;
							void navigate({
								to: "/orgs/$orgId/projects",
								params: { orgId: organization.id },
							});
							onNavigate();
						}}
						onOrganizationCreated={(organization) => {
							void navigate({
								to: "/orgs/$orgId/projects",
								params: { orgId: organization.id },
							});
							onNavigate();
						}}
					/>
					{/* Settings stay reachable for every member; write controls are gated inside the pages. */}
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={t("nav.orgSettings")}
									render={
										<Link
											to="/orgs/$orgId/settings"
											params={{ orgId }}
											onClick={onNavigate}
										/>
									}
								>
									<Settings />
								</Button>
							}
						/>
						<TooltipContent>{t("nav.orgSettings")}</TooltipContent>
					</Tooltip>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={onOpenCommand}
								className="text-sidebar-foreground/80 justify-between"
							>
								<Search />
								<span className="flex-1 text-left">{t("command.trigger")}</span>
								<Kbd className="hidden sm:inline-flex">
									{isMac ? "⌘K" : "Ctrl K"}
								</Kbd>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								render={
									<Link
										to="/orgs/$orgId/ai"
										params={{ orgId }}
										aria-label={t("nav.aiAssistant")}
										onClick={onNavigate}
										activeOptions={{ exact: true }}
										activeProps={{
											className: ACTIVE_ITEM_CLASS,
										}}
									/>
								}
								className="justify-between pr-9"
							>
								<Sparkles />
								<span className="flex-1 text-left">{t("nav.aiAssistant")}</span>
								<Kbd className="hidden sm:inline-flex">
									{isMac ? "⌘J" : "Ctrl J"}
								</Kbd>
							</SidebarMenuButton>
							<Tooltip>
								<TooltipTrigger
									render={
										<SidebarMenuAction
											aria-label={t("ai.newChat")}
											showOnHover
											onClick={onNewChat}
										>
											<Plus />
										</SidebarMenuAction>
									}
								/>
								<TooltipContent>{t("ai.newChat")}</TooltipContent>
							</Tooltip>
						</SidebarMenuItem>
						{recentConversations.length > 0 ? (
							<SidebarMenuItem>
								<SidebarMenuButton
									size="sm"
									className="text-muted-foreground font-normal"
									aria-expanded={recentChatsOpen}
									onClick={() => setRecentChatsOpen((open) => !open)}
								>
									<ChevronRight
										className={cn(
											"transition-transform",
											recentChatsOpen && "rotate-90",
										)}
									/>
									<span className="flex-1 text-left">
										{t("ai.recentChats")}
									</span>
								</SidebarMenuButton>
								{recentChatsOpen ? (
									<SidebarMenuSub>
										{recentConversations.map((conversation) => {
											const title = conversation.title || t("ai.untitled");
											return (
												<SidebarMenuSubItem key={conversation.id}>
													<Tooltip>
														<TooltipTrigger
															render={
																<SidebarMenuSubButton
																	size="sm"
																	render={
																		<Link
																			to="/orgs/$orgId/ai/$conversationId"
																			params={{
																				orgId,
																				conversationId: conversation.id,
																			}}
																			onClick={onNavigate}
																			activeProps={{
																				className: ACTIVE_ITEM_CLASS,
																			}}
																		/>
																	}
																>
																	<MessageSquare />
																	<span>{title}</span>
																</SidebarMenuSubButton>
															}
														/>
														<TooltipContent>{title}</TooltipContent>
													</Tooltip>
												</SidebarMenuSubItem>
											);
										})}
									</SidebarMenuSub>
								) : null}
							</SidebarMenuItem>
						) : null}
					</SidebarMenu>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarMenu>
						<SidebarLink
							to="/orgs/$orgId/my-issues"
							exact
							onNavigate={onNavigate}
						>
							<Inbox />
							<span>{t("nav.myIssues")}</span>
						</SidebarLink>
						<SidebarLink
							to="/orgs/$orgId/activity"
							exact
							onNavigate={onNavigate}
						>
							<Activity />
							<span>{t("nav.activity")}</span>
						</SidebarLink>
					</SidebarMenu>
					<SidebarGroupLabel className="justify-between gap-1 pr-1">
						<Link
							to="/orgs/$orgId/projects"
							params={{ orgId }}
							onClick={onNavigate}
							className="hover:text-sidebar-foreground flex h-full min-w-0 flex-1 items-center gap-2 rounded-md outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring"
							activeProps={{
								className: "text-sidebar-foreground font-medium",
							}}
						>
							<span className="truncate">{t("projects.sidebarTitle")}</span>
							<span className="ml-auto text-muted-foreground tabular-nums">
								{projects.isPending || projects.isError
									? null
									: activeProjects.length}
							</span>
						</Link>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label={t("projects.create")}
										title={frozen ? t("org.frozenBanner") : undefined}
										disabled={frozen}
										onClick={() => setCreateOpen(true)}
									>
										<Plus />
									</Button>
								}
							/>
							<TooltipContent>{t("projects.create")}</TooltipContent>
						</Tooltip>
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{projects.isPending
								? ["project-1", "project-2", "project-3"].map((key) => (
										<SidebarMenuItem key={key}>
											<SidebarMenuSkeleton showIcon />
										</SidebarMenuItem>
									))
								: visibleProjects.map((project) => (
										<SidebarMenuItem key={project.id}>
											<SidebarMenuButton
												className="pr-8"
												render={
													<Link
														to="/orgs/$orgId/projects/$projectId"
														params={{ orgId, projectId: project.id }}
														search={{ page: 1, sort: "updated" }}
														activeOptions={{ includeSearch: false }}
														onClick={onNavigate}
														activeProps={{
															className: ACTIVE_ITEM_CLASS,
														}}
													/>
												}
											>
												<span
													className="size-2 shrink-0 rounded-full"
													style={{
														backgroundColor:
															project.color ?? "var(--muted-foreground)",
													}}
												/>
												<span className="min-w-0 truncate">{project.name}</span>
											</SidebarMenuButton>
											{project.openIssueCount > 0 ? (
												<SidebarMenuBadge className="text-muted-foreground font-normal">
													{project.openIssueCount}
												</SidebarMenuBadge>
											) : null}
										</SidebarMenuItem>
									))}
							{!projects.isPending &&
							activeProjects.length > MAX_SIDEBAR_PROJECTS ? (
								<SidebarMenuItem>
									<SidebarMenuButton
										className="text-muted-foreground"
										render={
											<Link
												to="/orgs/$orgId/projects"
												params={{ orgId }}
												onClick={onNavigate}
											/>
										}
									>
										<ChevronRight />
										<span className="flex-1 text-left">
											{t("projects.viewAll", {
												count: activeProjects.length,
											})}
										</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							) : null}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				{session && (
					<UserDropdown
						user={session.user}
						orgId={orgId}
						orgRole={role as OrgRole | undefined}
						className="w-full"
					/>
				)}
			</SidebarFooter>
			<CreateProjectDialog
				orgId={orgId}
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>
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

function OrgLayoutContent({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	const { togglePanel } = useAiChat();
	const navigate = useNavigate();
	const orgs = useQuery(orgsQuery());
	const frozen = useOrgFrozen(orgId);
	const [paletteOpen, setPaletteOpen] = useState(false);

	useHotkeys({
		"g p": () => navigate({ to: "/orgs/$orgId/projects", params: { orgId } }),
		"g i": () => navigate({ to: "/orgs/$orgId/my-issues", params: { orgId } }),
		"g a": () => navigate({ to: "/orgs/$orgId/activity", params: { orgId } }),
		"g s": () => navigate({ to: "/orgs/$orgId/settings", params: { orgId } }),
	});

	const currentOrg = orgs.data?.find((org) => org.id === orgId);

	return (
		<SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:border focus:bg-background focus:p-3 focus:shadow-md"
			>
				{t("common.skipToContent")}
			</a>
			<Sidebar collapsible="offcanvas">
				<OrgSidebarContent onOpenCommand={() => setPaletteOpen(true)} />
			</Sidebar>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="bg-background sticky top-0 z-40 flex h-12 items-center gap-2 border-b px-3 md:hidden">
					<SidebarTrigger aria-label={t("nav.openMenu")} />
					<span className="min-w-0 flex-1 truncate text-sm font-medium">
						{currentOrg?.name ?? t("common.loading")}
					</span>
					<Button
						variant="ghost"
						size="icon"
						aria-label={t("ai.panel.toggle")}
						onClick={togglePanel}
					>
						<Sparkles />
					</Button>
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
			<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
		</SidebarProvider>
	);
}
