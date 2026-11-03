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
	ChevronsUpDown,
	Plus,
	Search,
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
		| "/orgs/$orgId/activity"
		| "/orgs/$orgId/ai"
		| "/orgs/$orgId/settings"
		| "/api-docs";
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
						params={to === "/api-docs" ? undefined : { orgId }}
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
	const { togglePanel, panelOpen } = useAiChat();

	const isMac = /mac|iphone|ipad/i.test(navigator.userAgent);
	const onNavigate = () => {
		if (isMobile) setOpenMobile(false);
	};

	const currentOrg = orgs.data?.find((org) => org.id === orgId);
	const activeProjects = (projects.data ?? []).filter(
		(project) => !project.archived,
	);

	return (
		<>
			<SidebarHeader>
				<OrganizationSwitcher
					align="start"
					className="w-full"
					hidePersonal
					hideSettings
					trigger={
						<DropdownMenuTrigger
							className={cn(
								buttonVariants({ variant: "ghost" }),
								"h-9 w-full justify-between px-2 text-left font-medium",
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
						<SidebarLink
							to="/orgs/$orgId/projects"
							exact
							onNavigate={onNavigate}
						>
							{t("nav.projects")}
						</SidebarLink>
						<SidebarLink
							to="/orgs/$orgId/my-issues"
							exact
							onNavigate={onNavigate}
						>
							{t("nav.myIssues")}
						</SidebarLink>
						<SidebarLink
							to="/orgs/$orgId/activity"
							exact
							onNavigate={onNavigate}
						>
							{t("nav.activity")}
						</SidebarLink>
						<SidebarLink to="/orgs/$orgId/ai" onNavigate={onNavigate}>
							<Sparkles />
							<span>{t("nav.ai")}</span>
						</SidebarLink>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => {
									if (isMobile) setOpenMobile(false);
									togglePanel();
								}}
								aria-pressed={panelOpen}
								className="text-sidebar-foreground/80 justify-between"
							>
								<Sparkles />
								<span className="flex-1 text-left">{t("ai.panel.toggle")}</span>
								<Kbd className="hidden sm:inline-flex">
									{isMac ? "⌘J" : "Ctrl J"}
								</Kbd>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarLink to="/orgs/$orgId/settings" onNavigate={onNavigate}>
							{t("nav.settings")}
						</SidebarLink>
						<SidebarLink to="/api-docs" onNavigate={onNavigate}>
							{t("nav.apiDocs")}
						</SidebarLink>
					</SidebarMenu>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel className="justify-between pr-1">
						{t("projects.sidebarTitle")}
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
