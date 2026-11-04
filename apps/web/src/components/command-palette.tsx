import { useQuery } from "@tanstack/react-query";
import { useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import type { StatusCategory } from "@workspace/shared";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@workspace/ui/components/command";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	ActivityIcon,
	BookOpenIcon,
	CircleAlertIcon,
	CirclePlusIcon,
	CreditCardIcon,
	FolderIcon,
	InboxIcon,
	KeyRoundIcon,
	ListTodoIcon,
	MessageSquareIcon,
	PlusIcon,
	RotateCcwIcon,
	SettingsIcon,
	ShieldIcon,
	Sparkles,
	TagIcon,
	UsersIcon,
	WebhookIcon,
} from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserAvatar } from "@/components/user-avatar";
import { useAiChat } from "@/features/ai/chat-provider";
import { useSession } from "@/features/auth/data";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import {
	StatusBadge,
	type StatusLike,
} from "@/features/issues/components/status-badge";
import { issueQuery } from "@/features/issues/data";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { projectsQuery } from "@/features/projects/data";
import {
	commentTarget,
	emptySearchResults,
	issueTarget,
	memberTarget,
	projectTarget,
	readRecent,
	recordRecent,
	type SearchProjectHitDto,
	searchQuery,
	useDebouncedValue,
} from "@/features/search/data";

/** Unified row shape for server hits and the `KEY-12` detail fallback. */
type PaletteIssue = {
	id: string;
	projectId: string;
	number: number;
	title: string;
	identifier: string;
	excerpt: string | null;
	priority: number;
	status: StatusLike;
};

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
	const userId = session?.user.id;
	const { setPanelOpen } = useAiChat();
	const projects = useQuery({ ...projectsQuery(orgId), enabled: open });

	// cmdk owns the input; mirror the term so it can be debounced into a search
	// and reset whenever the palette closes.
	const [term, setTerm] = useState("");
	const debouncedTerm = useDebouncedValue(term);
	const inputTerm = term.trim();
	const searchTerm = debouncedTerm.trim();

	const search = useQuery({
		...searchQuery(orgId, debouncedTerm),
		enabled: open && searchTerm.length > 0,
	});
	const results = search.data ?? emptySearchResults();
	const settled = inputTerm.length > 0 && searchTerm === inputTerm;
	// `pending` covers both the debounce window and the in-flight request so the
	// empty state never flashes before a search actually settles.
	const pending =
		inputTerm.length > 0 && (!settled || search.isFetching || search.isPending);
	const showEmpty = settled && search.isSuccess && !search.isFetching;
	const showError = settled && search.isError && !search.isFetching;

	const [recent, setRecent] = useState(() => readRecent(orgId, userId));
	useEffect(() => {
		if (open) {
			setRecent(readRecent(orgId, userId));
		}
	}, [open, orgId, userId]);

	useEffect(() => {
		if (!open) {
			setTerm("");
		}
	}, [open]);

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
	// "KEY-12" is not part of the API search terms, so resolve it directly.
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

	const issueResults: PaletteIssue[] = [];
	if (keyIssue.data) {
		const detail = keyIssue.data;
		issueResults.push({
			id: detail.id,
			projectId: detail.projectId,
			number: detail.number,
			title: detail.title,
			identifier: keyProject
				? `${keyProject.key}-${detail.number}`
				: `#${detail.number}`,
			excerpt: null,
			priority: detail.priority,
			status: detail.status,
		});
	}
	for (const hit of results.issues) {
		if (hit.id === keyIssue.data?.id) continue;
		issueResults.push({
			id: hit.id,
			projectId: hit.projectId,
			number: hit.number,
			title: hit.title,
			identifier: hit.identifier,
			excerpt: hit.descriptionExcerpt,
			priority: hit.priority,
			status: {
				name: hit.statusName,
				color: hit.statusColor,
				category: hit.statusCategory as StatusCategory,
			},
		});
	}
	const isAdmin = session?.user.role === "admin";
	const hasSearchResults =
		issueResults.length > 0 ||
		results.comments.length > 0 ||
		results.projects.length > 0 ||
		results.members.length > 0;

	const goToIssue = (projectId: string, issueNumber: number, hash?: string) =>
		navigate({
			to: "/orgs/$orgId/projects/$projectId/$issueNumber",
			params: { orgId, projectId, issueNumber: String(issueNumber) },
			hash,
		});

	const selectIssue = (issue: PaletteIssue) => {
		const target = issueTarget(issue);
		if (target.kind !== "issue") return;
		recordRecent(orgId, userId, {
			kind: "issue",
			projectId: target.projectId,
			issueNumber: target.issueNumber,
			identifier: issue.identifier,
			title: issue.title,
		});
		void goToIssue(target.projectId, target.issueNumber);
	};

	const selectComment = (hit: (typeof results.comments)[number]) => {
		const target = commentTarget(hit);
		if (target.kind !== "comment") return;
		recordRecent(orgId, userId, {
			kind: "issue",
			projectId: target.projectId,
			issueNumber: target.issueNumber,
			identifier: hit.issue.identifier,
			title: hit.issue.title,
		});
		void goToIssue(target.projectId, target.issueNumber, target.hash);
	};

	const selectProject = (
		project: Pick<SearchProjectHitDto, "id" | "name" | "key">,
	) => {
		const target = projectTarget(project);
		if (target.kind !== "project") return;
		recordRecent(orgId, userId, {
			kind: "project",
			projectId: target.projectId,
			name: project.name,
			key: project.key,
		});
		void navigate({
			to: "/orgs/$orgId/projects/$projectId",
			params: { orgId, projectId: target.projectId },
			search: { page: 1, sort: "updated" },
		});
	};

	const selectMember = (memberId: string) => {
		const target = memberTarget(memberId, currentProjectId);
		if (target.kind === "member-no-project") {
			toast.info(t("command.search.memberNoProject"));
			return;
		}
		if (target.kind !== "member") return;
		void navigate({
			to: "/orgs/$orgId/projects/$projectId",
			params: { orgId, projectId: target.projectId },
			search: { page: 1, sort: "updated", assigneeId: target.assigneeId },
		});
	};

	const searchableKeyword = inputTerm;

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
				{inputTerm.length > 0 ? (
					<>
						{pending && (
							<CommandItem
								value="__searching"
								keywords={[searchableKeyword]}
								disabled
							>
								<Spinner className="text-muted-foreground size-4" />
								<span className="text-muted-foreground">
									{t("command.search.searching")}
								</span>
							</CommandItem>
						)}
						{showError && (
							<CommandItem
								value="__search-error"
								keywords={[searchableKeyword]}
								onSelect={() => void search.refetch()}
							>
								<CircleAlertIcon className="text-destructive" />
								<span className="text-destructive min-w-0 flex-1 truncate">
									{t("command.search.failed")}
								</span>
								<span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
									<RotateCcwIcon className="size-3" />
									{t("command.search.retry")}
								</span>
							</CommandItem>
						)}
						{issueResults.length > 0 && (
							<CommandGroup heading={t("command.groups.issues")}>
								{issueResults.map((issue) => (
									<CommandItem
										key={issue.id}
										value={`${issue.identifier} ${issue.title}`}
										keywords={[searchableKeyword]}
										onSelect={() => run(() => selectIssue(issue))}
									>
										<span className="text-muted-foreground shrink-0 font-mono text-xs">
											{issue.identifier}
										</span>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate">{issue.title}</span>
											{issue.excerpt && (
												<span className="text-muted-foreground truncate text-xs">
													{issue.excerpt}
												</span>
											)}
										</span>
										<StatusBadge status={issue.status} className="shrink-0" />
										<PriorityBadge
											value={issue.priority}
											className="shrink-0"
										/>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{results.comments.length > 0 && (
							<CommandGroup heading={t("command.groups.comments")}>
								{results.comments.map((hit) => (
									<CommandItem
										key={hit.id}
										value={`${hit.body} ${hit.issue.identifier}`}
										keywords={[searchableKeyword]}
										onSelect={() => run(() => selectComment(hit))}
									>
										<MessageSquareIcon className="text-muted-foreground shrink-0" />
										<span className="min-w-0 flex-1 truncate">{hit.body}</span>
										<span className="text-muted-foreground shrink-0 font-mono text-xs">
											{hit.issue.identifier}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{results.projects.length > 0 && (
							<CommandGroup heading={t("command.groups.projects")}>
								{results.projects.map((hit) => (
									<CommandItem
										key={hit.id}
										value={`${hit.name} ${hit.key}`}
										keywords={[searchableKeyword]}
										onSelect={() => run(() => selectProject(hit))}
									>
										<span
											className="size-2 shrink-0 rounded-full"
											style={{
												backgroundColor: hit.color ?? "var(--muted-foreground)",
											}}
										/>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate">{hit.name}</span>
											{hit.descriptionExcerpt && (
												<span className="text-muted-foreground truncate text-xs">
													{hit.descriptionExcerpt}
												</span>
											)}
										</span>
										<span className="text-muted-foreground shrink-0 font-mono text-xs">
											{hit.key}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{results.members.length > 0 && (
							<CommandGroup heading={t("command.groups.people")}>
								{results.members.map((member) => (
									<CommandItem
										key={member.id}
										value={`${member.name} ${member.id}`}
										keywords={[searchableKeyword, member.name]}
										onSelect={() => run(() => selectMember(member.id))}
									>
										<UserAvatar name={member.name} image={member.image} />
										<span className="min-w-0 flex-1 truncate">
											{member.name}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{showEmpty && !hasSearchResults && (
							<CommandEmpty>{t("command.empty")}</CommandEmpty>
						)}
					</>
				) : (
					<>
						{recent.length > 0 && (
							<>
								<CommandGroup heading={t("command.groups.recent")}>
									{recent.map((entry) => (
										<CommandItem
											key={`${entry.kind}:${entry.projectId}:${entry.kind === "issue" ? entry.issueNumber : ""}`}
											value={
												entry.kind === "issue"
													? `${entry.identifier} ${entry.title}`
													: `${entry.name} ${entry.key}`
											}
											onSelect={() =>
												run(() => {
													if (entry.kind === "issue") {
														void goToIssue(entry.projectId, entry.issueNumber);
													} else {
														void navigate({
															to: "/orgs/$orgId/projects/$projectId",
															params: {
																orgId,
																projectId: entry.projectId,
															},
															search: { page: 1, sort: "updated" },
														});
													}
												})
											}
										>
											{entry.kind === "issue" ? (
												<ListTodoIcon className="text-muted-foreground shrink-0" />
											) : (
												<FolderIcon className="text-muted-foreground shrink-0" />
											)}
											<span className="text-muted-foreground shrink-0 font-mono text-xs">
												{entry.kind === "issue" ? entry.identifier : entry.key}
											</span>
											<span className="min-w-0 flex-1 truncate">
												{entry.kind === "issue" ? entry.title : entry.name}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
								<CommandSeparator />
							</>
						)}
						<CommandGroup heading={t("command.groups.actions")}>
							<CommandItem
								onSelect={() =>
									run(() => {
										setPanelOpen(true);
									})
								}
							>
								<Sparkles />
								{t("command.askAi")}
							</CommandItem>
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
							<CommandItem
								onSelect={() =>
									run(() =>
										navigate({
											to: "/orgs/$orgId/inbox",
											params: { orgId },
											search: { filter: "all" },
										}),
									)
								}
							>
								<InboxIcon />
								{t("command.goToInbox")}
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
								<CommandItem
									onSelect={() => run(() => navigate({ to: "/admin" }))}
								>
									<ShieldIcon />
									{t("command.goToAdmin")}
								</CommandItem>
							)}
						</CommandGroup>
						{activeProjects.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup heading={t("command.groups.projects")}>
									{activeProjects.map((project) => (
										<CommandItem
											key={project.id}
											value={project.name}
											onSelect={() => run(() => selectProject(project))}
										>
											<span
												className="size-2 shrink-0 rounded-full"
												style={{
													backgroundColor:
														project.color ?? "var(--muted-foreground)",
												}}
											/>
											<span className="min-w-0 truncate">{project.name}</span>
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</>
				)}
			</CommandList>
		</CommandDialog>
	);
}
