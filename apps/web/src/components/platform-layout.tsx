import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
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
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import {
	Building2,
	Gauge,
	type LucideIcon,
	Shield,
	User,
	Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ACTIVE_ITEM_CLASS } from "@/components/org-sidebar-item-class";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { useSession } from "@/features/auth/data";

type PlatformRoute = "/account" | "/admin" | "/admin/users" | "/admin/orgs";

function PlatformSidebarLink({
	to,
	exact,
	icon: Icon,
	label,
	onNavigate,
}: {
	to: PlatformRoute;
	exact?: boolean;
	icon: LucideIcon;
	label: string;
	onNavigate?: () => void;
}) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				tooltip={label}
				render={
					<Link
						to={to}
						activeOptions={{ exact }}
						onClick={onNavigate}
						activeProps={{
							className: ACTIVE_ITEM_CLASS,
						}}
					/>
				}
			>
				<Icon />
				<span>{label}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function readSidebarOpen() {
	if (typeof document === "undefined") return true;
	return !document.cookie
		.split("; ")
		.some((cookie) => cookie === "sidebar_state=false");
}

function PlatformSidebarContent() {
	const { t } = useTranslation();
	const { data: session } = useSession();
	const { isMobile, setOpenMobile, state } = useSidebar();
	// Same rail/sheet split as the org sidebar: the mobile Sheet always
	// renders full content, only the desktop rail collapses.
	const collapsed = state === "collapsed" && !isMobile;
	const isAdmin = session?.user.role === "admin";

	const onNavigate = () => {
		if (isMobile) setOpenMobile(false);
	};

	const collapseTrigger = (
		<Tooltip>
			<TooltipTrigger
				render={
					<SidebarTrigger
						aria-label={
							collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
						}
						className="hidden md:inline-flex"
					/>
				}
			/>
			<TooltipContent side={collapsed ? "right" : "bottom"}>
				{collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
			</TooltipContent>
		</Tooltip>
	);

	return (
		<>
			<SidebarHeader>
				{collapsed ? (
					<div className="flex flex-col items-center gap-1">
						<Tooltip>
							<TooltipTrigger
								render={
									<Link
										to="/"
										aria-label={t("nav.backToApp")}
										className={cn(
											buttonVariants({ variant: "ghost" }),
											"size-8 shrink-0 justify-center p-0 font-semibold",
										)}
									/>
								}
							>
								<Shield className="size-4" />
							</TooltipTrigger>
							<TooltipContent side="right">{t("nav.backToApp")}</TooltipContent>
						</Tooltip>
						{collapseTrigger}
					</div>
				) : (
					<div className="flex items-center gap-1">
						<Link
							to="/"
							aria-label={t("nav.backToApp")}
							className={cn(
								buttonVariants({ variant: "ghost" }),
								"h-9 min-w-0 flex-1 justify-start px-2 text-left font-semibold",
							)}
						>
							<Shield className="size-4 shrink-0" />
							<span className="truncate">React Hono Template</span>
						</Link>
						{collapseTrigger}
					</div>
				)}
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					{!collapsed ? (
						<SidebarGroupLabel>{t("nav.account")}</SidebarGroupLabel>
					) : null}
					<SidebarMenu>
						<PlatformSidebarLink
							to="/account"
							exact
							icon={User}
							label={t("nav.accountSettings")}
							onNavigate={onNavigate}
						/>
					</SidebarMenu>
				</SidebarGroup>
				{isAdmin && (
					<SidebarGroup>
						{!collapsed ? (
							<SidebarGroupLabel>{t("nav.admin")}</SidebarGroupLabel>
						) : null}
						<SidebarMenu>
							<PlatformSidebarLink
								to="/admin"
								exact
								icon={Gauge}
								label={t("nav.overview")}
								onNavigate={onNavigate}
							/>
							<PlatformSidebarLink
								to="/admin/users"
								icon={Users}
								label={t("nav.users")}
								onNavigate={onNavigate}
							/>
							<PlatformSidebarLink
								to="/admin/orgs"
								icon={Building2}
								label={t("nav.orgs")}
								onNavigate={onNavigate}
							/>
						</SidebarMenu>
					</SidebarGroup>
				)}
			</SidebarContent>
			<SidebarFooter className={collapsed ? "items-center" : undefined}>
				{session && (
					<UserDropdown
						user={session.user}
						size={collapsed ? "icon" : "default"}
						className={collapsed ? undefined : "w-full"}
					/>
				)}
			</SidebarFooter>
		</>
	);
}

/**
 * Shell for the account page and the platform admin area — the same Sidebar
 * primitives as the org layout, minus everything org-scoped (org switcher,
 * projects, command palette, feature panels, mobile tab bar). Content keeps
 * the former AppLayout container so pages need no wrapper of their own.
 */
export function PlatformLayout({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const [defaultSidebarOpen] = useState(readSidebarOpen);

	return (
		<SidebarProvider defaultOpen={defaultSidebarOpen} defaultWidth={240}>
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:border focus:bg-background focus:p-3 focus:shadow-md"
			>
				{t("common.skipToContent")}
			</a>
			<Sidebar collapsible="icon">
				<PlatformSidebarContent />
				<SidebarRail
					title={t("nav.sidebarRailHint")}
					aria-label={t("nav.toggleSidebar")}
					className="max-md:hidden"
				/>
			</Sidebar>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="bg-background sticky top-0 z-40 flex h-12 items-center gap-2 border-b px-3 md:hidden">
					<SidebarTrigger aria-label={t("nav.openMenu")} />
					<span className="min-w-0 flex-1 truncate text-sm font-medium">
						React Hono Template
					</span>
					<ThemeToggle />
				</header>
				<main
					id="main-content"
					className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6"
				>
					{children}
				</main>
			</div>
		</SidebarProvider>
	);
}
