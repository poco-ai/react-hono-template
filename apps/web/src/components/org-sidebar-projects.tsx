import type { ProjectDto } from "@api/features/projects/dto/project.dto";
import { Link } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
} from "@workspace/ui/components/sidebar";
import { Folder } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { webProjectExtras } from "@/features/registry";
import { ACTIVE_ITEM_CLASS } from "./org-sidebar-item-class";

export function OrgSidebarProjects({
	orgId,
	projects,
	pending,
	currentProjectId,
	onNavigate,
}: {
	orgId: string;
	projects: ProjectDto[];
	pending: boolean;
	currentProjectId?: string;
	onNavigate: () => void;
}) {
	const { t } = useTranslation();
	const projectExtras = webProjectExtras();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{t("projects.sidebarTitle")}</SidebarGroupLabel>
			<SidebarMenu>
				{pending
					? ["project-1", "project-2", "project-3"].map((key) => (
							<SidebarMenuItem key={key}>
								<SidebarMenuSkeleton showIcon />
							</SidebarMenuItem>
						))
					: projects.map((project) => (
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
												project.color ? { color: project.color } : undefined
											}
										/>
										<span className="min-w-0 truncate">{project.name}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
								{currentProjectId === project.id
									? projectExtras.map((ProjectExtras) => (
											<ProjectExtras
												key={ProjectExtras.displayName ?? ProjectExtras.name}
												orgId={orgId}
												projectId={project.id}
												onNavigate={onNavigate}
											/>
										))
									: null}
							</Fragment>
						))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
