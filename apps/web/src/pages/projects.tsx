import type { ProjectDto } from "@api/dto/project.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CircleAlert, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { client, unwrap } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { MANAGE_ROLES, membersQuery } from "@/lib/queries/members";
import { projectsQuery } from "@/lib/queries/projects";
import { useSession } from "@/lib/session";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useOrgFrozen } from "@/lib/use-org-frozen";

export function ProjectsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("projects.title"));
	const navigate = useNavigate({ from: "/orgs/$orgId/projects/" });
	const { archived: archivedParam } = useSearch({
		from: "/_auth/orgs/$orgId/projects/",
	});
	const archived = archivedParam ?? false;
	const queryClient = useQueryClient();
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

	const archiveMutation = useMutation({
		mutationFn: (project: ProjectDto) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].$patch({
					param: { orgId, projectId: project.id },
					json: { archived: !project.archived },
				}),
			),
		onSuccess: (_data, project) => {
			toast.success(
				t(
					project.archived
						? "toast.projectUnarchived"
						: "toast.projectArchived",
				),
			);
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			setArchiveTarget(null);
		},
	});

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6">
			<div className="flex items-center justify-between pb-6">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("projects.title")}
				</h1>
				{canManage && (
					<Button onClick={() => setCreateOpen(true)} disabled={frozen}>
						<Plus />
						{t("projects.create")}
					</Button>
				)}
			</div>

			<div className="bg-muted mb-4 flex w-fit rounded-lg p-0.5">
				<Button
					variant={archived ? "ghost" : "secondary"}
					size="sm"
					onClick={() => setShowArchived(false)}
				>
					{t("projects.activeTab")}
				</Button>
				<Button
					variant={archived ? "secondary" : "ghost"}
					size="sm"
					onClick={() => setShowArchived(true)}
				>
					{t("projects.archivedTab")}
				</Button>
			</div>

			{projects.isPending && (
				<p className="text-muted-foreground py-16 text-center text-sm">
					{t("common.loading")}
				</p>
			)}
			{projects.isError && (
				<p className="py-16 text-center text-sm text-red-500">
					{apiErrorMessage(t, projects.error)}
				</p>
			)}

			{projects.data?.length === 0 && (
				<div className="border-muted-foreground/25 flex flex-col items-center gap-4 rounded-xl border border-dashed py-20 text-center">
					<p className="text-muted-foreground">{t("projects.empty")}</p>
					<div className="flex items-center gap-2">
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
					</div>
				</div>
			)}

			{projects.data &&
				projects.data.length > 0 &&
				visibleProjects.length === 0 && (
					<p className="text-muted-foreground py-16 text-center text-sm">
						{archived ? t("projects.archivedEmpty") : t("projects.activeEmpty")}
					</p>
				)}

			{visibleProjects.length > 0 && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{visibleProjects.map((project) => (
						<Card
							key={project.id}
							className="group cursor-pointer py-0 transition-colors hover:bg-accent/40"
							onClick={() =>
								navigate({
									to: "/orgs/$orgId/projects/$projectId",
									params: { orgId, projectId: project.id },
									search: { page: 1, sort: "updated" },
								})
							}
						>
							<CardHeader>
								<div className="flex items-start justify-between gap-2">
									<CardTitle className="text-base">{project.name}</CardTitle>
									{canManage && (
										<DropdownMenu>
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
									{project.description ?? ""}
								</CardDescription>
							</CardHeader>
							<CardContent className="flex items-center gap-2">
								<Badge variant="outline" className="font-mono">
									{project.key}
								</Badge>
								{project.archived && (
									<Badge variant="secondary">
										{t("projects.archivedBadge")}
									</Badge>
								)}
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
