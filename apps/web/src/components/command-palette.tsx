import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@workspace/ui/components/command";
import {
	ActivityIcon,
	BookOpenIcon,
	CreditCardIcon,
	FolderIcon,
	KeyRoundIcon,
	ListTodoIcon,
	PlusIcon,
	SettingsIcon,
	TagIcon,
	UsersIcon,
	WebhookIcon,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { projectsQuery } from "@/lib/queries/projects";
import { useOrgRole } from "@/lib/use-org-role";

export function CommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: Dispatch<SetStateAction<boolean>>;
}) {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const navigate = useNavigate();
	const { canManage } = useOrgRole(orgId);
	const projects = useQuery({ ...projectsQuery(orgId), enabled: open });

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				onOpenChange((previous) => !previous);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onOpenChange]);

	const run = (navigateFn: () => void) => {
		onOpenChange(false);
		navigateFn();
	};

	const activeProjects = (projects.data ?? []).filter(
		(project) => !project.archived,
	);

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("command.title")}
			description={t("command.description")}
		>
			<CommandInput placeholder={t("command.placeholder")} />
			<CommandList>
				<CommandEmpty>{t("command.empty")}</CommandEmpty>
				<CommandGroup heading={t("command.groups.goto")}>
					<CommandItem
						onSelect={() =>
							run(() =>
								navigate({
									to: "/orgs/$orgId/projects",
									params: { orgId },
								}),
							)
						}
					>
						<FolderIcon />
						{t("command.goToProjects")}
					</CommandItem>
					<CommandItem
						onSelect={() =>
							run(() =>
								navigate({
									to: "/orgs/$orgId/my-issues",
									params: { orgId },
								}),
							)
						}
					>
						<ListTodoIcon />
						{t("command.goToMyIssues")}
					</CommandItem>
					<CommandItem
						onSelect={() =>
							run(() =>
								navigate({
									to: "/orgs/$orgId/activity",
									params: { orgId },
								}),
							)
						}
					>
						<ActivityIcon />
						{t("command.goToActivity")}
					</CommandItem>
					<CommandItem
						onSelect={() =>
							run(() =>
								navigate({
									to: "/orgs/$orgId/settings",
									params: { orgId },
								}),
							)
						}
					>
						<SettingsIcon />
						{t("command.settingsGeneral")}
					</CommandItem>
					<CommandItem
						onSelect={() =>
							run(() =>
								navigate({
									to: "/orgs/$orgId/settings/members",
									params: { orgId },
								}),
							)
						}
					>
						<UsersIcon />
						{t("command.settingsMembers")}
					</CommandItem>
					<CommandItem
						onSelect={() =>
							run(() =>
								navigate({
									to: "/orgs/$orgId/settings/labels",
									params: { orgId },
								}),
							)
						}
					>
						<TagIcon />
						{t("command.settingsLabels")}
					</CommandItem>
					{canManage && (
						<>
							<CommandItem
								onSelect={() =>
									run(() =>
										navigate({
											to: "/orgs/$orgId/settings/api-keys",
											params: { orgId },
										}),
									)
								}
							>
								<KeyRoundIcon />
								{t("command.settingsApiKeys")}
							</CommandItem>
							<CommandItem
								onSelect={() =>
									run(() =>
										navigate({
											to: "/orgs/$orgId/settings/webhooks",
											params: { orgId },
										}),
									)
								}
							>
								<WebhookIcon />
								{t("command.settingsWebhooks")}
							</CommandItem>
							<CommandItem
								onSelect={() =>
									run(() =>
										navigate({
											to: "/orgs/$orgId/settings/billing",
											params: { orgId },
										}),
									)
								}
							>
								<CreditCardIcon />
								{t("command.settingsBilling")}
							</CommandItem>
						</>
					)}
					<CommandItem
						onSelect={() => run(() => navigate({ to: "/api-docs" }))}
					>
						<BookOpenIcon />
						{t("command.goToApiDocs")}
					</CommandItem>
				</CommandGroup>
				<CommandSeparator />
				<CommandGroup heading={t("command.groups.projects")}>
					{activeProjects.map((project) => (
						<CommandItem
							key={project.id}
							value={project.name}
							onSelect={() =>
								run(() =>
									navigate({
										to: "/orgs/$orgId/projects/$projectId",
										params: { orgId, projectId: project.id },
										search: { page: 1, sort: "updated" },
									}),
								)
							}
						>
							<span
								className="size-2 shrink-0 rounded-full"
								style={{
									backgroundColor: project.color ?? "var(--muted-foreground)",
								}}
							/>
							<span className="min-w-0 truncate">{project.name}</span>
						</CommandItem>
					))}
				</CommandGroup>
				<CommandSeparator />
				<CommandGroup heading={t("command.groups.actions")}>
					<CommandItem
						onSelect={() =>
							run(() =>
								navigate({
									to: "/orgs/$orgId/projects",
									params: { orgId },
								}),
							)
						}
					>
						<PlusIcon />
						{t("command.newProject")}
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
