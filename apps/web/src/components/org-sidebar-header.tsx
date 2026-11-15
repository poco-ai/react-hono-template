import { useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { DropdownMenuTrigger } from "@workspace/ui/components/dropdown-menu";
import {
	SidebarHeader,
	SidebarTrigger,
} from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronsUpDown, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrganizationSwitcher } from "@/components/auth/organization/organization-switcher";

export function OrgSidebarHeader({
	currentOrg,
	orgsPending,
	collapsed,
	onOpenCommand,
	onNavigate,
}: {
	currentOrg?: { id: string; name: string };
	orgsPending: boolean;
	collapsed: boolean;
	onOpenCommand?: () => void;
	onNavigate: () => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();

	const organizationSwitcher = (
		<OrganizationSwitcher
			align="start"
			hidePersonal
			hideSettings
			trigger={
				collapsed ? (
					<DropdownMenuTrigger
						aria-label={currentOrg?.name ?? t("common.loading")}
						disabled={orgsPending}
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
						disabled={orgsPending}
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
	);
}
