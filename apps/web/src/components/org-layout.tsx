import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
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
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
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
	ChevronsUpDown,
	Inbox,
	Plus,
	Search,
	Settings,
	Snowflake,
	Sparkles,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
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
							className: "bg-sidebar-accent text-sidebar-accent-foreground",
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
	const { isMobile, setOpenMobile } = useSidebar();
	const { newChat } = useAiChat();

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
										activeProps={{
											className:
												"bg-sidebar-accent text-sidebar-accent-foreground",
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
								: activeProjects.map((project) => (
										<SidebarMenuItem key={project.id}>
											<SidebarMenuButton
												render={
													<Link
														to="/orgs/$orgId/projects/$projectId"
														params={{ orgId, projectId: project.id }}
														search={{ page: 1, sort: "updated" }}
														onClick={onNavigate}
														activeProps={{
															className:
																"bg-sidebar-accent text-sidebar-accent-foreground font-medium",
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
										</SidebarMenuItem>
									))}
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
