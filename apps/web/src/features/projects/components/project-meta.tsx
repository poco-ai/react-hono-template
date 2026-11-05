import type { ProjectDto } from "@api/dto/project.dto";
import { cn } from "@workspace/ui/lib/utils";
import { CalendarDays, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/user-avatar";
import type { OrgMember } from "@/features/members/data";
import { formatUtcDate } from "@/lib/format";
import { projectTargetDateStatus } from "../utils";
import { ProjectHealthBadge } from "./project-health-badge";

/**
 * Compact project facts shown in the project header: health, lead and target
 * date. Overdue and near-term target dates use a warning treatment.
 */
export function ProjectMeta({
	project,
	members,
	className,
}: {
	project: ProjectDto;
	members: readonly OrgMember[];
	className?: string;
}) {
	const { t } = useTranslation();
	const lead = members.find((member) => member.userId === project.leadId);
	const targetStatus = projectTargetDateStatus(project.targetDate);
	const targetClassName =
		targetStatus === "overdue"
			? "text-destructive font-medium"
			: targetStatus === "soon"
				? "text-amber-600 dark:text-amber-400 font-medium"
				: undefined;

	return (
		<div
			className={cn(
				"text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-sm",
				className,
			)}
		>
			<ProjectHealthBadge health={project.health} />
			<span className="flex items-center gap-1.5">
				{lead ? (
					<UserAvatar
						name={lead.user.name}
						image={lead.user.image}
						className="size-5 text-[10px]"
					/>
				) : (
					<UserRound className="size-4" aria-hidden="true" />
				)}
				<span className="text-foreground max-w-40 truncate">
					{lead?.user.name ?? t("projects.noLead")}
				</span>
			</span>
			<span
				className={cn(
					"flex items-center gap-1.5",
					project.targetDate ? targetClassName : undefined,
				)}
			>
				<CalendarDays className="size-4" aria-hidden="true" />
				{project.targetDate ? (
					<>
						{t("projects.targetDateValue", {
							date: formatUtcDate(project.targetDate),
						})}
						{targetStatus === "overdue" && (
							<span className="text-destructive">
								{" "}
								· {t("projects.targetDateOverdue")}
							</span>
						)}
						{targetStatus === "soon" && (
							<span> · {t("projects.targetDateSoon")}</span>
						)}
					</>
				) : (
					<span>{t("projects.noTargetDate")}</span>
				)}
			</span>
		</div>
	);
}
