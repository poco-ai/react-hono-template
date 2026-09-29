import { useQuery } from "@tanstack/react-query";
import {
	Link,
	Outlet,
	useLocation,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { Check, ChevronsUpDown, Menu, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { membersQuery, type OrgRole } from "@/lib/queries/members";
import { orgsQuery } from "@/lib/queries/org";
import { projectsQuery } from "@/lib/queries/projects";
import { useSession } from "@/lib/session";

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
		| "/orgs/$orgId/settings"
		| "/api-docs";
	exact?: boolean;
	onNavigate?: () => void;
	children: ReactNode;
}) {
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	return (
		<Link
			to={to}
			params={to === "/api-docs" ? undefined : { orgId }}
			activeOptions={{ exact }}
			onClick={onNavigate}
			className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium"
			activeProps={{
				className: "bg-accent text-foreground",
			}}
		>
			{children}
		</Link>
	);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const navigate = useNavigate();
	const { data: session } = useSession();
	const orgs = useQuery(orgsQuery());
	const projects = useQuery(projectsQuery(orgId));
	const members = useQuery(membersQuery(orgId));
	const [createOpen, setCreateOpen] = useState(false);

	const currentOrg = orgs.data?.find((org) => org.id === orgId);
	const myMember = members.data?.find((m) => m.userId === session?.user.id);
	const activeProjects = (projects.data ?? []).filter(
		(project) => !project.archived,
	);

	return (
		<>
			<div className="p-2">
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								className="h-9 w-full justify-between px-2 font-medium"
							>
								<span className="min-w-0 truncate">
									{currentOrg?.name ?? t("common.loading")}
								</span>
								<ChevronsUpDown className="text-muted-foreground size-4" />
							</Button>
						}
					/>
					<DropdownMenuContent align="start" className="w-56">
						<DropdownMenuGroup>
							<DropdownMenuLabel>{t("org.switcherLabel")}</DropdownMenuLabel>
							{(orgs.data ?? []).map((org) => (
								<DropdownMenuItem
									key={org.id}
									onClick={() => {
										navigate({
											to: "/orgs/$orgId/projects",
											params: { orgId: org.id },
										});
										onNavigate?.();
									}}
								>
									<Check
										className={cn(
											"size-4",
											org.id === orgId ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="min-w-0 truncate">{org.name}</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => {
								navigate({ to: "/onboarding" });
								onNavigate?.();
							}}
						>
							<Plus className="size-4" />
							{t("org.create")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<nav className="flex flex-col gap-0.5 px-2">
				<SidebarLink to="/orgs/$orgId/projects" exact onNavigate={onNavigate}>
					{t("nav.projects")}
				</SidebarLink>
				<SidebarLink to="/orgs/$orgId/my-issues" exact onNavigate={onNavigate}>
					{t("nav.myIssues")}
				</SidebarLink>
				<SidebarLink to="/orgs/$orgId/activity" exact onNavigate={onNavigate}>
					{t("nav.activity")}
				</SidebarLink>
				<SidebarLink to="/orgs/$orgId/settings" onNavigate={onNavigate}>
					{t("nav.settings")}
				</SidebarLink>
				<SidebarLink to="/api-docs" onNavigate={onNavigate}>
					{t("nav.apiDocs")}
				</SidebarLink>
			</nav>
			<div className="mt-4 flex min-h-0 flex-1 flex-col px-2">
				<div className="flex items-center justify-between px-2 pb-1">
					<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						{t("projects.sidebarTitle")}
					</span>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("projects.create")}
						onClick={() => setCreateOpen(true)}
					>
						<Plus />
					</Button>
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-2">
					{activeProjects.map((project) => (
						<Link
							key={project.id}
							to="/orgs/$orgId/projects/$projectId"
							params={{ orgId, projectId: project.id }}
							search={{ page: 1, sort: "updated" }}
							onClick={onNavigate}
							className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
							activeProps={{
								className: "bg-accent text-foreground font-medium",
							}}
						>
							<span
								className="size-2 shrink-0 rounded-full"
								style={{
									backgroundColor: project.color ?? "var(--muted-foreground)",
								}}
							/>
							<span className="min-w-0 truncate">{project.name}</span>
						</Link>
					))}
				</div>
			</div>
			<div className="flex items-center gap-1 border-t p-2">
				{session && (
					<UserDropdown
						user={session.user}
						orgRole={myMember?.role as OrgRole | undefined}
						className="flex-1"
					/>
				)}
				<LanguageSwitcher />
				<ThemeToggle />
			</div>
			<CreateProjectDialog
				orgId={orgId}
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>
		</>
	);
}

export function OrgLayout() {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const location = useLocation();
	const orgs = useQuery(orgsQuery());
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		if (location.pathname) {
			setMenuOpen(false);
		}
	}, [location.pathname]);

	const currentOrg = orgs.data?.find((org) => org.id === orgId);

	return (
		<div className="bg-background flex min-h-svh flex-col lg:flex-row">
			<aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r lg:flex">
				<SidebarContent />
			</aside>
			<header className="bg-background sticky top-0 z-40 flex h-12 items-center gap-2 border-b px-3 lg:hidden">
				<Button
					variant="ghost"
					size="icon"
					aria-label={t("nav.openMenu")}
					onClick={() => setMenuOpen(true)}
				>
					<Menu />
				</Button>
				<span className="min-w-0 flex-1 truncate text-sm font-medium">
					{currentOrg?.name ?? t("common.loading")}
				</span>
				<ThemeToggle />
			</header>
			<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
				<SheetContent
					side="left"
					showCloseButton={false}
					className="gap-0 data-[side=left]:w-72"
				>
					<SheetTitle className="sr-only">
						{currentOrg?.name ?? t("common.loading")}
					</SheetTitle>
					<SidebarContent onNavigate={() => setMenuOpen(false)} />
				</SheetContent>
			</Sheet>
			<main className="min-w-0 flex-1">
				<Outlet />
			</main>
		</div>
	);
}
