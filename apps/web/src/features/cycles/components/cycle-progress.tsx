import { Progress } from "@workspace/ui/components/progress";
import { useTranslation } from "react-i18next";
import { cycleRemainingDays } from "@/features/cycles/cycle-utils";
import type { CycleWithProgressDto } from "@/features/cycles/data";

/** Progress bar plus the completed/total count and the days remaining. */
export function CycleProgress({
	cycle,
	className,
}: {
	cycle: Pick<CycleWithProgressDto, "endsAt" | "progress">;
	className?: string;
}) {
	const { t } = useTranslation();
	const days = cycleRemainingDays(cycle.endsAt);
	const remaining =
		days > 0
			? t("cycles.daysLeft", { count: days })
			: days === 0
				? t("cycles.endsToday")
				: t("cycles.ended");

	return (
		<div className={className}>
			<Progress value={cycle.progress.percent} />
			<div className="text-muted-foreground mt-1.5 flex items-center justify-between gap-2 text-xs">
				<span>
					{t("cycles.progress", {
						terminal: cycle.progress.terminal,
						total: cycle.progress.total,
					})}
				</span>
				<span>{remaining}</span>
			</div>
		</div>
	);
}
