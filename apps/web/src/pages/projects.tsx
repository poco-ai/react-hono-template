import type { ProjectDto } from "@api/dto/project.dto";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { CircleAlert, CircleDot, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useSession } from "@/features/auth/data";
import { MANAGE_ROLES, membersQuery } from "@/features/members/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { EditProjectDialog } from "@/features/projects/components/edit-project-dialog";
import { projectsQuery, useArchiveProject } from "@/features/projects/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

export function ProjectsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("projects.title"));
	const navigate = useNavigate({ from: "/orgs/$orgId/projects/" });
	const { archived: archivedParam } = useSearch({
		from: "/_auth/orgs/$orgId/projects/",
	});
	const archived = archivedParam ?? false;

	const { data: session } = useSession();
	const projects = useQuery(projectsQuery(orgId));
	const members = useQuery(membersQuery(orgId));
	const frozen = useOrgFrozen(orgId);
	const [createOpen, setCreateOpen] = useState(false);
	const [archiveTarget, setArchiveTarget] = useState<ProjectDto | null>(null);
	const [editTarget, setEditTarget] = useState<ProjectDto | null>(null);

	const setShowArchived = (next: boolean) =>
		navigate({
			search: (prev) => ({ ...prev, archived: next || undefined }),
		});

	const myRole = members.data?.find((m) => m.userId === session?.user.id)?.role;
	const canManage =
		myRole !== undefined && (MANAGE_ROLES as string[]).includes(myRole);

	const visibleProjects = (projects.data ?? []).filter(
		(project) => project.archived === archived,
	);
	// The empty state owns the only "create" call to action while the list is empty.
	const hideHeaderCreate =
		!projects.isPending && !projects.isError && projects.data?.length === 0;

	const archiveMutation = useArchiveProject(orgId, {
		onSuccess: (_data, project) => {
			toast.success(
				t(
					project.archived
						? "toast.projectUnarchived"
						: "toast.projectArchived",
				),
			);

			setArchiveTarget(null);
		},
	});

	return (
		<div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
			<div className="flex items-center justify-between pb-6">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("projects.title")}
				</h1>
				{canManage && !hideHeaderCreate && (
					<Button onClick={() => setCreateOpen(true)} disabled={frozen}>
						<Plus />
						{t("projects.create")}
					</Button>
				)}
			</div>

			<ToggleGroup
				value={[archived ? "archived" : "active"]}
				onValueChange={(next) => {
					if (next[0]) setShowArchived(next[0] === "archived");
				}}
				spacing={0}
				variant="outline"
				className="mb-4"
			>
				<ToggleGroupItem value="active" size="sm">
					{t("projects.activeTab")}
				</ToggleGroupItem>
				<ToggleGroupItem value="archived" size="sm">
					{t("projects.archivedTab")}
				</ToggleGroupItem>
			</ToggleGroup>

			{projects.isPending && (
				<div
					className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4"
					aria-hidden="true"
					aria-busy="true"
				>
					{["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"].map(
						(cardKey) => (
							<Card key={cardKey} className="gap-0 py-0">
								<CardHeader className="gap-1.5 px-4 pt-4 pb-3">
									<div className="flex items-center gap-2">
										<Skeleton className="size-2.5 rounded-full" />
										<Skeleton className="h-5 w-1/2" />
										<Skeleton className="ml-auto h-5 w-12 rounded-md" />
									</div>
									<div className="flex flex-col gap-1.5">
										<Skeleton className="h-4 w-full" />
										<Skeleton className="h-4 w-2/3" />
									</div>
								</CardHeader>
								<CardContent className="mt-auto flex items-center justify-between gap-2 border-t px-4 py-2.5">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-14" />
								</CardContent>
							</Card>
						),
					)}
				</div>
			)}
			{projects.isError && (
				<Alert variant="destructive" className="my-16">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, projects.error)}
					</AlertDescription>
				</Alert>
			)}

			{projects.data?.length === 0 && (
				<EmptyState
					title={t("projects.empty")}
					action={
						<>
							{canManage && (
								<Button
									variant="outline"
									onClick={() => setCreateOpen(true)}
									disabled={frozen}
								>
									<Plus />
									{t("projects.emptyCta")}
								</Button>
							)}
							<Button
								variant="outline"
								onClick={() =>
									navigate({
										to: "/orgs/$orgId/settings/members",
										params: { orgId },
									})
								}
							>
								{t("projects.inviteTeammates")}
							</Button>
						</>
					}
				/>
			)}

			{projects.data &&
				projects.data.length > 0 &&
				visibleProjects.length === 0 && (
					<EmptyState
						title={
							archived ? t("projects.archivedEmpty") : t("projects.activeEmpty")
						}
					/>
				)}

			{visibleProjects.length > 0 && (
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
					{visibleProjects.map((project) => (
						<Card
							key={project.id}
							className="group flex h-full cursor-pointer flex-col gap-0 py-0 transition-all hover:bg-accent/40 hover:shadow-sm hover:ring-foreground/20"
							onClick={() =>
								navigate({
									to: "/orgs/$orgId/projects/$projectId",
									params: { orgId, projectId: project.id },
									search: { page: 1, sort: "updated" },
								})
							}
						>
							<CardHeader className="gap-1.5 px-4 pt-4 pb-3">
								<div className="flex items-start justify-between gap-2">
									<div className="flex min-w-0 flex-1 items-center gap-2">
										<span
											className="size-2.5 shrink-0 rounded-full"
											style={{
												backgroundColor:
													project.color ?? "var(--muted-foreground)",
											}}
										/>
										<CardTitle className="min-w-0 truncate text-base">
											{project.name}
										</CardTitle>
										<Badge variant="outline" className="rounded-md font-mono">
											{project.key}
										</Badge>
										{project.archived && (
											<Badge variant="secondary" className="rounded-md">
												{t("projects.archivedBadge")}
											</Badge>
										)}
									</div>
									{canManage && (
										<DropdownMenu>
											<Tooltip>
												<TooltipTrigger
													render={
														<DropdownMenuTrigger
															render={
																<Button
																	variant="ghost"
																	size="icon-sm"
																	aria-label={t("common.actions")}
																	disabled={frozen}
																	onClick={(e) => e.stopPropagation()}
																>
																	<MoreHorizontal />
																</Button>
															}
														/>
													}
												/>
												<TooltipContent>{t("common.actions")}</TooltipContent>
											</Tooltip>
											<DropdownMenuContent
												align="end"
												onClick={(e) => e.stopPropagation()}
											>
												<DropdownMenuItem
													onClick={() => setEditTarget(project)}
												>
													{t("common.edit")}
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() => setArchiveTarget(project)}
												>
													{project.archived
														? t("projects.unarchive")
														: t("projects.archive")}
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</div>
								<CardDescription className="line-clamp-2 min-h-10">
									{project.description?.trim() || t("projects.noDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent className="mt-auto flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
								<div className="flex w-full items-center justify-between gap-2">
									<span className="flex items-center gap-1 whitespace-nowrap">
										<CircleDot className="size-3.5 shrink-0" />
										{t("projects.openIssues", {
											count: project.openIssueCount,
										})}{" "}
										·{" "}
										{t("projects.totalIssues", {
											count: project.totalIssueCount,
										})}
									</span>
									<span className="shrink-0">
										{formatRelativeTime(project.updatedAt)}
									</span>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{archiveMutation.isError && (
				<Alert variant="destructive" className="mt-4">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, archiveMutation.error)}
					</AlertDescription>
				</Alert>
			)}

			<CreateProjectDialog
				orgId={orgId}
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>

			<EditProjectDialog
				orgId={orgId}
				project={editTarget}
				open={editTarget !== null}
				onOpenChange={(open) => !open && setEditTarget(null)}
			/>

			<AlertDialog
				open={archiveTarget !== null}
				onOpenChange={(open) => !open && setArchiveTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{archiveTarget?.archived
								? t("projects.unarchiveConfirmTitle")
								: t("projects.archiveConfirmTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{archiveTarget?.archived
								? t("projects.unarchiveConfirmDescription", {
										name: archiveTarget?.name ?? "",
									})
								: t("projects.archiveConfirmDescription", {
										name: archiveTarget?.name ?? "",
									})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							disabled={archiveMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								if (archiveTarget) {
									archiveMutation.mutate(archiveTarget);
								}
							}}
						>
							{archiveTarget?.archived
								? t("projects.unarchive")
								: t("projects.archive")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
