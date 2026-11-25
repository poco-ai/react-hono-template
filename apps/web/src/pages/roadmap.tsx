import type {
	RoadmapCycleDto,
	RoadmapProjectDto,
} from "@api/features/roadmap/dto/roadmap.dto";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CircleAlert, Map as MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { ProjectHealthBadge } from "@/features/projects/components/project-health-badge";
import {
	cycleTone,
	RoadmapStackedList,
} from "@/features/roadmap/components/stacked-list";
import { roadmapQuery } from "@/features/roadmap/data";
import {
	isWithinTimeline,
	roadmapMonthTicks,
	type TimelineWindow,
	timelineBarGeometry,
	timelinePercent,
} from "@/features/roadmap/timeline";
import { dateFormatter, formatDateOnly, isoToDateOnly } from "@/lib/date";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useMediaQuery } from "@/lib/use-media-query";

const GRID_COLUMNS = "14rem minmax(40rem, 1fr)";
const SKELETON_ROWS = ["roadmap-1", "roadmap-2", "roadmap-3", "roadmap-4"];

/**
 * Read-only roadmap: one row per active project, cycles positioned on a
 * month-scaled timeline. Pure CSS positioning (no chart/calendar dependency);
 * the timeline scrolls horizontally while the project column and month header
 * stay pinned.
 */
export function RoadmapPage({ orgId }: { orgId: string }) {
	const { t, i18n } = useTranslation();
	useDocumentTitle(t("roadmap.title"));
	const navigate = useNavigate();
	const isMobile = useMediaQuery("(max-width: 767px)");
	const roadmap = useQuery(roadmapQuery(orgId));

	const window: TimelineWindow | null = roadmap.data
		? { from: roadmap.data.from, to: roadmap.data.to }
		: null;
	const ticks = window ? roadmapMonthTicks(window) : [];
	const monthFormat = dateFormatter(i18n.language, {
		month: "short",
		year: "numeric",
	});
	const formatTargetDate = (value: string) =>
		formatDateOnly(isoToDateOnly(value), i18n.language, {
			month: "short",
			day: "numeric",
		});

	const openCycle = (project: RoadmapProjectDto, cycle: RoadmapCycleDto) => {
		void navigate({
			to: "/orgs/$orgId/projects/$projectId",
			params: { orgId, projectId: project.id },
			search: { page: 1, sort: "updated", cycleId: cycle.id },
		});
	};

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 py-8 lg:px-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("roadmap.title")}
				</h1>
				{roadmap.data?.truncated ? (
					<Badge variant="outline" className="shrink-0">
						{t("roadmap.truncated")}
					</Badge>
				) : null}
			</div>

			{roadmap.isError ? (
				<Alert variant="destructive" className="mt-6">
					<CircleAlert />
					<AlertDescription className="flex flex-col items-start gap-2">
						{apiErrorMessage(t, roadmap.error)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => void roadmap.refetch()}
						>
							{t("common.retry")}
						</Button>
					</AlertDescription>
				</Alert>
			) : null}

			{roadmap.isPending ? (
				<div className="mt-6 space-y-3" aria-busy="true" aria-hidden="true">
					<Skeleton className="h-8 w-full" />
					{SKELETON_ROWS.map((key) => (
						<Skeleton key={key} className="h-16 w-full" />
					))}
				</div>
			) : null}

			{roadmap.isSuccess && roadmap.data.projects.length === 0 ? (
				<EmptyState
					icon={MapIcon}
					title={t("roadmap.empty")}
					description={t("roadmap.emptyDescription")}
				/>
			) : null}

			{roadmap.data && roadmap.data.projects.length > 0 && isMobile ? (
				<div className="mt-6 min-h-0 flex-1 pb-6">
					<RoadmapStackedList
						projects={roadmap.data.projects}
						onOpenCycle={openCycle}
						formatDate={formatTargetDate}
					/>
				</div>
			) : null}

			{window &&
			roadmap.data &&
			roadmap.data.projects.length > 0 &&
			!isMobile ? (
				<div className="mt-6 min-h-0 flex-1 overflow-auto">
					<div className="min-w-[54rem]">
						<div
							className="bg-background sticky top-0 z-20 grid border-b"
							style={{ gridTemplateColumns: GRID_COLUMNS }}
						>
							<div className="bg-background sticky left-0 z-30 border-r px-4 py-2 text-xs font-medium">
								{t("roadmap.projectsColumn")}
							</div>
							<div className="relative h-9">
								{ticks.map((tick) => (
									<div
										key={tick.key}
										className="absolute inset-y-0 flex items-center border-l px-2 text-xs font-medium text-muted-foreground"
										style={{
											left: `${tick.percent}%`,
											width: `${tick.widthPercent}%`,
										}}
									>
										<span className="truncate">
											{monthFormat.format(tick.start)}
										</span>
									</div>
								))}
							</div>
						</div>

						{roadmap.data.projects.map((project) => (
							<div
								key={project.id}
								className="grid border-b"
								style={{ gridTemplateColumns: GRID_COLUMNS }}
							>
								<div className="bg-background sticky left-0 z-10 flex flex-col gap-1 border-r px-4 py-3">
									<div className="flex min-w-0 items-center gap-2">
										<span
											className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
											style={
												project.color
													? { backgroundColor: project.color }
													: undefined
											}
										/>
										<span className="truncate text-sm font-medium">
											{project.name}
										</span>
										<Badge
											variant="outline"
											className="shrink-0 rounded-md font-mono text-[10px]"
										>
											{project.key}
										</Badge>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<ProjectHealthBadge health={project.health} />
										<span className="text-muted-foreground text-xs tabular-nums">
											{t("roadmap.issueCount", {
												open: project.issueCount.open,
												total: project.issueCount.total,
											})}
										</span>
										{project.targetDate ? (
											<span className="text-muted-foreground text-xs">
												{t("roadmap.target", {
													date: formatTargetDate(project.targetDate),
												})}
											</span>
										) : null}
									</div>
								</div>

								<div className="relative h-16">
									{ticks.map((tick) => (
										<div
											key={tick.key}
											className="pointer-events-none absolute inset-y-0 border-l border-border/50"
											style={{ left: `${tick.percent}%` }}
										/>
									))}

									{project.targetDate ? (
										<TargetMarker
											date={project.targetDate}
											window={window}
											label={t("roadmap.targetMarker", {
												date: formatTargetDate(project.targetDate),
											})}
										/>
									) : null}

									{project.cycles.map((cycle) => {
										const geometry = timelineBarGeometry(
											cycle.startsAt,
											cycle.endsAt,
											window,
										);
										return (
											// Native button on purpose: this absolutely positioned
											// cycle bar is a timeline graphic, and Button's
											// variant/size border and padding would break its
											// geometry.
											<button
												key={cycle.id}
												type="button"
												title={t("roadmap.openCycle", { name: cycle.name })}
												onClick={() => openCycle(project, cycle)}
												className={`absolute top-3 flex h-10 flex-col justify-center gap-0.5 overflow-hidden rounded-md border px-1.5 text-left transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${cycleTone[cycle.status]}`}
												style={{
													left: `${geometry.left}%`,
													width: `${geometry.width}%`,
												}}
											>
												<span className="truncate text-xs leading-tight font-medium">
													{cycle.name}
												</span>
												<span className="text-[10px] leading-tight tabular-nums">
													{t("roadmap.cycleProgress", {
														percent: cycle.progress.percent,
														total: cycle.progress.total,
													})}
												</span>
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

function TargetMarker({
	date,
	window,
	label,
}: {
	date: string;
	window: TimelineWindow;
	label: string;
}) {
	if (!isWithinTimeline(date, window)) {
		return null;
	}
	const percent = timelinePercent(date, window);
	return (
		<div
			className="pointer-events-none absolute inset-y-0 z-[1] w-px border-l border-dashed border-amber-500/70"
			style={{ left: `${percent}%` }}
		>
			<span
				className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rotate-45 bg-amber-500"
				aria-hidden="true"
			/>
			<span className="sr-only">{label}</span>
		</div>
	);
}
