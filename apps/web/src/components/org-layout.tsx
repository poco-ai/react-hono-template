import type { AiConversationDto } from "@api/dto/ai.dto";
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
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarProvider,
	SidebarRail,
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
	ChevronsUpDown,
	Folder,
	FolderKanban,
	Inbox,
	Search,
	Snowflake,
	Sparkles,
	SquarePen,
} from "lucide-react";
import { type CSSProperties, Fragment, type ReactNode, useState } from "react";
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
import { projectsQuery } from "@/features/projects/data";
import { useHotkeys } from "@/lib/use-hotkeys";

const ACTIVE_ITEM_CLASS =
	"bg-sidebar-accent text-sidebar-accent-foreground font-medium";

function SidebarLink({
	to,
	exact,
	tooltip,
	onNavigate,
	children,
}: {
	to:
		| "/orgs/$orgId/projects"
		| "/orgs/$orgId/my-issues"
		| "/orgs/$orgId/activity";
	exact?: boolean;
	tooltip?: string;
	onNavigate?: () => void;
	children: ReactNode;
}) {
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				tooltip={tooltip}
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

function ConversationRow({
	orgId,
	conversation,
	indented = false,
	onNavigate,
}: {
	orgId: string;
	conversation: AiConversationDto;
	indented?: boolean;
	onNavigate?: () => void;
}) {
	const { t } = useTranslation();
	const title = conversation.title || t("ai.untitled");
	return (
		<SidebarMenuItem>
			<Tooltip>
				<TooltipTrigger
					render={
						<SidebarMenuButton
							className={indented ? "pl-14" : "pl-8"}
							render={
								<Link
									to="/orgs/$orgId/ai/$conversationId"
									params={{ orgId, conversationId: conversation.id }}
									onClick={onNavigate}
									activeProps={{ className: ACTIVE_ITEM_CLASS }}
								/>
							}
						>
							<span className="min-w-0 truncate">{title}</span>
						</SidebarMenuButton>
					}
				/>
				<TooltipContent>{title}</TooltipContent>
			</Tooltip>
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

	const organizationSwitcher = (
		<OrganizationSwitcher
			align="start"
			hidePersonal
			hideSettings
			trigger={
				collapsed ? (
					<DropdownMenuTrigger
						aria-label={currentOrg?.name ?? t("common.loading")}
						disabled={orgs.isPending}
						className={cn(
							buttonVariants({ variant: "ghost" }),
							"size-8 shrink-0 justify-center p-0 font-semibold",
						)}
						render={<TooltipTrigger />}
					>
						{currentOrg ? (
							<span className="text-sm">
								{currentOrg.name.trim().charAt(0).toUpperCase()}
							</span>
						) : (
							<Skeleton className="size-5 rounded-md" />
						)}
					</DropdownMenuTrigger>
				) : (
					<DropdownMenuTrigger
						disabled={orgs.isPending}
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
				)
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
	);

	const searchButton = (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("nav.search")}
						onClick={onOpenCommand}
					>
						<Search />
					</Button>
				}
			/>
			<TooltipContent>{t("nav.search")}</TooltipContent>
		</Tooltip>
	);

	return (
		<>
			<SidebarHeader>
				{collapsed ? (
					<div className="flex flex-col items-center gap-1">
						<Tooltip>
							{organizationSwitcher}
							<TooltipContent side="right">
								{currentOrg?.name ?? t("common.loading")}
							</TooltipContent>
						</Tooltip>
						{searchButton}
						<Tooltip>
							<TooltipTrigger
								render={
									<SidebarTrigger
										aria-label={t("nav.expandSidebar")}
										className="hidden md:inline-flex"
									/>
								}
							/>
							<TooltipContent side="right">
								{t("nav.expandSidebar")}
							</TooltipContent>
						</Tooltip>
					</div>
				) : (
					<div className="flex items-center gap-1">
						{organizationSwitcher}
						{searchButton}
						<Tooltip>
							<TooltipTrigger
								render={
									<SidebarTrigger
										aria-label={t("nav.collapseSidebar")}
										className="hidden md:inline-flex"
									/>
								}
							/>
							<TooltipContent>{t("nav.collapseSidebar")}</TooltipContent>
						</Tooltip>
					</div>
				)}
			</SidebarHeader>
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
						<SidebarLink
							to="/orgs/$orgId/my-issues"
							exact
							tooltip={t("nav.myIssues")}
							onNavigate={onNavigate}
						>
							<Inbox />
							<span>{t("nav.myIssues")}</span>
						</SidebarLink>
						<SidebarLink
							to="/orgs/$orgId/activity"
							exact
							tooltip={t("nav.activity")}
							onNavigate={onNavigate}
						>
							<Activity />
							<span>{t("nav.activity")}</span>
						</SidebarLink>
						{collapsed ? (
							<SidebarLink
								to="/orgs/$orgId/projects"
								tooltip={t("nav.projects")}
								onNavigate={onNavigate}
							>
								<FolderKanban />
								<span>{t("nav.projects")}</span>
							</SidebarLink>
						) : null}
					</SidebarMenu>
				</SidebarGroup>
				{!collapsed ? (
					<SidebarGroup>
						<SidebarGroupLabel>{t("projects.sidebarTitle")}</SidebarGroupLabel>
						<SidebarMenu>
							{projects.isPending
								? ["project-1", "project-2", "project-3"].map((key) => (
										<SidebarMenuItem key={key}>
											<SidebarMenuSkeleton showIcon />
										</SidebarMenuItem>
									))
								: activeProjects.map((project) => (
										<Fragment key={project.id}>
											<SidebarMenuItem>
												<SidebarMenuButton
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
													<Folder
														className="shrink-0 text-muted-foreground"
														style={
															project.color
																? { color: project.color }
																: undefined
														}
													/>
													<span className="min-w-0 truncate">
														{project.name}
													</span>
												</SidebarMenuButton>
											</SidebarMenuItem>
											{currentProject?.id === project.id
												? projectConversations.map((conversation) => (
														<ConversationRow
															key={conversation.id}
															orgId={orgId}
															conversation={conversation}
															indented
															onNavigate={onNavigate}
														/>
													))
												: null}
										</Fragment>
									))}
						</SidebarMenu>
					</SidebarGroup>
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
	const { togglePanel } = useAiChat();
	const navigate = useNavigate();
	const orgs = useQuery(orgsQuery());
	const frozen = useOrgFrozen(orgId);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [defaultSidebarOpen] = useState(readSidebarOpen);

	useHotkeys({
		"g p": () => navigate({ to: "/orgs/$orgId/projects", params: { orgId } }),
		"g i": () => navigate({ to: "/orgs/$orgId/my-issues", params: { orgId } }),
		"g a": () => navigate({ to: "/orgs/$orgId/activity", params: { orgId } }),
		"g s": () => navigate({ to: "/orgs/$orgId/settings", params: { orgId } }),
	});

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
