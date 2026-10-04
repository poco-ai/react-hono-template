import { useQuery } from "@tanstack/react-query";
import { useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import type { IssueStatus } from "@workspace/shared";
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
	CirclePlusIcon,
	CreditCardIcon,
	FolderIcon,
	KeyRoundIcon,
	ListTodoIcon,
	PlusIcon,
	SettingsIcon,
	ShieldIcon,
	TagIcon,
	UsersIcon,
	WebhookIcon,
} from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/data";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { issueQuery, issueSearchQuery } from "@/features/issues/data";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { projectsQuery } from "@/features/projects/data";

const SEARCH_DEBOUNCE_MS = 200;

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
	const matchRoute = useMatchRoute();
	const { canManage } = useOrgRole(orgId);
	const { data: session } = useSession();
	const projects = useQuery({ ...projectsQuery(orgId), enabled: open });

	// cmdk owns the input; mirror the term so it can be debounced into an
	// issue search and reset whenever the palette closes.
	const [term, setTerm] = useState("");
	const [debouncedTerm, setDebouncedTerm] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedTerm(term), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [term]);

	useEffect(() => {
		if (!open) {
			setTerm("");
			setDebouncedTerm("");
		}
	}, [open]);

	const issues = useQuery(issueSearchQuery(orgId, debouncedTerm));

	// "New issue" is only offered from a route that carries a project.
	const projectListMatch = matchRoute({
		to: "/orgs/$orgId/projects/$projectId",
		includeSearch: false,
	});
	const issueDetailMatch = matchRoute({
		to: "/orgs/$orgId/projects/$projectId/$issueNumber",
		includeSearch: false,
	});
	const currentProjectId = projectListMatch
		? projectListMatch.projectId
		: issueDetailMatch
			? issueDetailMatch.projectId
			: undefined;

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
	const projectById = new Map(
		(projects.data ?? []).map((project) => [project.id, project]),
	);
	// "KEY-12" is not part of the API's title search, so resolve it directly.
	const keyTerm = /^([A-Za-z]{2,6})-(\d+)$/.exec(debouncedTerm.trim());
	const keyProject = keyTerm
		? (projects.data ?? []).find(
				(project) => project.key.toLowerCase() === keyTerm[1].toLowerCase(),
			)
		: undefined;
	const keyNumber = keyTerm ? Number(keyTerm[2]) : 0;
	const keyIssue = useQuery({
		...issueQuery(orgId, keyProject?.id ?? "", keyNumber),
		enabled: open && keyProject !== undefined && keyNumber > 0,
	});

	const issueResults = [
		...(keyIssue.data ? [keyIssue.data] : []),
		...(issues.data?.items ?? []).filter(
			(issue) => issue.id !== keyIssue.data?.id,
		),
	];
	const isAdmin = session?.user.role === "admin";

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("command.title")}
			description={t("command.description")}
		>
			<CommandInput
				placeholder={t("command.placeholder")}
				value={term}
				onValueChange={setTerm}
			/>
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
					{isAdmin && (
						<CommandItem onSelect={() => run(() => navigate({ to: "/admin" }))}>
							<ShieldIcon />
							{t("command.goToAdmin")}
						</CommandItem>
					)}
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
				{issueResults.length > 0 && (
					<>
						<CommandSeparator />
						<CommandGroup heading={t("command.groups.issues")}>
							{issueResults.map((issue) => {
								const project = projectById.get(issue.projectId);
								const label = project
									? `${project.key}-${issue.number}`
									: `#${issue.number}`;
								return (
									<CommandItem
										key={issue.id}
										value={`${label} ${issue.title}`}
										keywords={[debouncedTerm]}
										onSelect={() =>
											run(() =>
												navigate({
													to: "/orgs/$orgId/projects/$projectId/$issueNumber",
													params: {
														orgId,
														projectId: issue.projectId,
														issueNumber: String(issue.number),
													},
												}),
											)
										}
									>
										<span className="text-muted-foreground shrink-0 font-mono text-xs">
											{label}
										</span>
										<span className="min-w-0 flex-1 truncate">
											{issue.title}
										</span>
										<StatusBadge
											status={issue.status as IssueStatus}
											className="shrink-0"
										/>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</>
				)}
				<CommandSeparator />
				<CommandGroup heading={t("command.groups.actions")}>
					{currentProjectId && (
						<CommandItem
							onSelect={() =>
								run(() =>
									navigate({
										to: "/orgs/$orgId/projects/$projectId",
										params: { orgId, projectId: currentProjectId },
										search: { page: 1, sort: "updated", new: true },
									}),
								)
							}
						>
							<CirclePlusIcon />
							{t("command.newIssue")}
						</CommandItem>
					)}
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
