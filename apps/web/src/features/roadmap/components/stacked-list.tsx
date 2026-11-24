import type {
	RoadmapCycleDto,
	RoadmapProjectDto,
} from "@api/features/roadmap/dto/roadmap.dto";
import { Badge } from "@workspace/ui/components/badge";
import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProjectHealthBadge } from "@/features/projects/components/project-health-badge";

/** Status tone shared by the timeline bars and the mobile stacked cards. */
export const cycleTone: Record<RoadmapCycleDto["status"], string> = {
	current: "border-primary/60 bg-primary/15 text-primary",
	upcoming: "border-border bg-muted text-foreground",
	past: "border-border/60 bg-muted/50 text-muted-foreground",
};

/**
 * Mobile (<768px) replacement for the roadmap timeline: one section per
 * project, its cycles stacked as compact cards with a progress bar and date
 * range. Same payload and the same cycle navigation as the timeline, minus
 * the horizontal scrolling.
 */
export function RoadmapStackedList({
	projects,
	onOpenCycle,
	formatDate,
}: {
	projects: RoadmapProjectDto[];
	onOpenCycle: (project: RoadmapProjectDto, cycle: RoadmapCycleDto) => void;
	/** Formats an ISO timestamp the same way the timeline header does. */
	formatDate: (value: string) => string;
}) {
	const { t } = useTranslation();

	return (
		<div className="divide-y">
			{projects.map((project) => (
				<section key={project.id} className="py-4 first:pt-1 last:pb-0">
					<div className="flex min-w-0 items-center gap-2 px-4">
						<Folder
							className="text-muted-foreground size-4 shrink-0"
							style={project.color ? { color: project.color } : undefined}
						/>
						<span className="truncate text-sm font-medium">{project.name}</span>
						<Badge
							variant="outline"
							className="shrink-0 rounded-md font-mono text-[10px]"
						>
							{project.key}
						</Badge>
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-2 px-4">
						<ProjectHealthBadge health={project.health} />
						<span className="text-muted-foreground text-xs tabular-nums">
							{t("roadmap.issueCount", {
								open: project.issueCount.open,
								total: project.issueCount.total,
							})}
						</span>
						{project.targetDate ? (
							<span className="text-muted-foreground text-xs">
								{t("roadmap.target", { date: formatDate(project.targetDate) })}
							</span>
						) : null}
					</div>

					{project.cycles.length > 0 ? (
						<ul className="mt-3 space-y-2 px-4">
							{project.cycles.map((cycle) => (
								<li key={cycle.id}>
									{/* Native button on purpose: this cycle bar is a timeline
									    graphic (tone border + progress track), so Button's
									    variant/size padding and border would break it. */}
									<button
										type="button"
										title={t("roadmap.openCycle", { name: cycle.name })}
										onClick={() => onOpenCycle(project, cycle)}
										className={`focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-left transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:outline-none ${cycleTone[cycle.status]}`}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="truncate text-sm font-medium">
												{cycle.name}
											</span>
											<span className="shrink-0 text-xs leading-tight tabular-nums">
												{t("roadmap.cycleProgress", {
													percent: cycle.progress.percent,
													total: cycle.progress.total,
												})}
											</span>
										</div>
										<div
											className="bg-background/60 mt-2 h-1.5 overflow-hidden rounded-full"
											aria-hidden="true"
										>
											<div
												className="h-full rounded-full bg-current"
												style={{ width: `${cycle.progress.percent}%` }}
											/>
										</div>
										<div className="mt-1.5 text-xs opacity-80 tabular-nums">
											{t("roadmap.cycleRange", {
												start: formatDate(cycle.startsAt),
												end: formatDate(cycle.endsAt),
											})}
										</div>
									</button>
								</li>
							))}
						</ul>
					) : null}
				</section>
			))}
		</div>
	);
}
