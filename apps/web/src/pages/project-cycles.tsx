import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CycleStatus } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import { ArrowLeft, CalendarRange, CircleAlert, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { NotFoundState } from "@/components/not-found-state";
import { CycleCard } from "@/features/cycles/components/cycle-card";
import { CycleDeleteDialog } from "@/features/cycles/components/cycle-delete-dialog";
import { CycleFormDialog } from "@/features/cycles/components/cycle-form-dialog";
import { CycleRolloverDialog } from "@/features/cycles/components/cycle-rollover-dialog";
import { groupCyclesByStatus } from "@/features/cycles/cycle-utils";
import { type CycleWithProgressDto, cyclesQuery } from "@/features/cycles/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { projectQuery } from "@/features/projects/data";
import { apiErrorMessage, isNotFoundError } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

const TABS: CycleStatus[] = ["current", "upcoming", "past"];

export function ProjectCyclesPage({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId: string;
}) {
	const { t } = useTranslation();
	const project = useQuery(projectQuery(orgId, projectId));
	useDocumentTitle(
		project.data?.name
			? `${project.data.name} · ${t("cycles.title")}`
			: undefined,
	);
	const cycles = useQuery(cyclesQuery(orgId, projectId));
	const frozen = useOrgFrozen(orgId);
	// Cycle writes are owner/admin only (the API enforces the same rule).
	const { canManage } = useOrgRole(orgId);

	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<CycleWithProgressDto>();
	const [deleting, setDeleting] = useState<CycleWithProgressDto>();
	const [rolling, setRolling] = useState<CycleWithProgressDto>();

	const groups = groupCyclesByStatus(cycles.data?.items ?? []);

	if (project.isError && isNotFoundError(project.error)) {
		return (
			<NotFoundState
				title={t("projects.notFoundTitle")}
				action={
					<Link
						to="/orgs/$orgId/projects"
						params={{ orgId }}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<ArrowLeft className="size-4" />
						{t("projects.backToProjects")}
					</Link>
				}
			/>
		);
	}

	return (
		<div className="flex min-h-svh flex-col">
			<header className="border-b px-4 py-6 lg:px-6">
				<Link
					to="/orgs/$orgId/projects/$projectId"
					params={{ orgId, projectId }}
					search={{ page: 1, sort: "updated" }}
					className={buttonVariants({
						variant: "link",
						size: "sm",
						className: "mb-2 h-auto justify-start p-0",
					})}
				>
					<ArrowLeft className="size-4" />
					{project.data?.name ?? t("projects.backToProjects")}
				</Link>
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="flex items-center gap-3">
							<h1 className="truncate text-2xl font-semibold tracking-tight">
								{t("cycles.title")}
							</h1>
							{project.data && (
								<Badge variant="outline" className="rounded-md font-mono">
									{project.data.key}
								</Badge>
							)}
						</div>
						<p className="text-muted-foreground mt-1 max-w-2xl text-sm">
							{t("cycles.description")}
						</p>
					</div>
					{canManage && (
						<Button onClick={() => setCreateOpen(true)} disabled={frozen}>
							<Plus />
							{t("cycles.newCycle")}
						</Button>
					)}
				</div>
			</header>

			<div className="px-4 py-6 lg:px-6">
				{cycles.isError && (
					<Alert variant="destructive" className="mb-4">
						<CircleAlert />
						<AlertDescription>
							{apiErrorMessage(t, cycles.error)}
						</AlertDescription>
					</Alert>
				)}

				<Tabs defaultValue="current">
					<TabsList>
						{TABS.map((status) => (
							<TabsTrigger key={status} value={status}>
								{t(`cycles.status.${status}`)}
								<Badge
									variant="secondary"
									className="rounded-full px-1.5 text-xs tabular-nums"
								>
									{groups[status].length}
								</Badge>
							</TabsTrigger>
						))}
					</TabsList>

					{TABS.map((status) => (
						<TabsContent key={status} value={status} className="mt-4">
							{cycles.isPending ? (
								<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
									{["cycle-1", "cycle-2", "cycle-3"].map((key) => (
										<Card key={key} className="gap-0 py-0" aria-busy="true">
											<CardHeader className="gap-2 px-4 pt-4 pb-3">
												<Skeleton className="h-5 w-40" />
												<Skeleton className="h-3 w-32" />
												<Skeleton className="h-3 w-full" />
											</CardHeader>
										</Card>
									))}
								</div>
							) : groups[status].length === 0 ? (
								<EmptyState
									icon={CalendarRange}
									title={t(`cycles.empty.${status}`)}
								/>
							) : (
								<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
									{groups[status].map((cycle) => (
										<CycleCard
											key={cycle.id}
											orgId={orgId}
											projectId={projectId}
											cycle={cycle}
											frozen={frozen}
											canManage={canManage}
											onEdit={() => setEditing(cycle)}
											onDelete={() => setDeleting(cycle)}
											onRollover={() => setRolling(cycle)}
										/>
									))}
								</div>
							)}
						</TabsContent>
					))}
				</Tabs>
			</div>

			<CycleFormDialog
				orgId={orgId}
				projectId={projectId}
				open={createOpen || Boolean(editing)}
				cycle={editing}
				onOpenChange={(next) => {
					if (!next) {
						setCreateOpen(false);
						setEditing(undefined);
					}
				}}
			/>
			<CycleDeleteDialog
				orgId={orgId}
				projectId={projectId}
				open={Boolean(deleting)}
				cycle={deleting}
				onOpenChange={(next) => {
					if (!next) {
						setDeleting(undefined);
					}
				}}
			/>
			<CycleRolloverDialog
				orgId={orgId}
				projectId={projectId}
				open={Boolean(rolling)}
				cycle={rolling}
				cycles={cycles.data?.items ?? []}
				onOpenChange={(next) => {
					if (!next) {
						setRolling(undefined);
					}
				}}
			/>
		</div>
	);
}
