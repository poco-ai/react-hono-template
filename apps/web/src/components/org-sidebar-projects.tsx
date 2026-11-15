import type { AiConversationDto } from "@api/dto/ai.dto";
import type { ProjectDto } from "@api/dto/project.dto";
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
import { ConversationRow } from "./org-conversation-row";
import { ACTIVE_ITEM_CLASS } from "./org-sidebar-link";

export function OrgSidebarProjects({
	orgId,
	projects,
	pending,
	currentProjectId,
	projectConversations,
	onNavigate,
}: {
	orgId: string;
	projects: ProjectDto[];
	pending: boolean;
	currentProjectId?: string;
	projectConversations: AiConversationDto[];
	onNavigate: () => void;
}) {
	const { t } = useTranslation();

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
	);
}
