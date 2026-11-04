import type { StatusDto } from "@api/dto/status.dto";
import type { IssueStatus, StatusCategory } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * A status object from the API. Legacy string values (`todo`, `in_progress`,
 * ...) are still accepted so cached payloads from before the workflow-status
 * migration keep rendering.
 */
export type StatusLike =
	| Pick<StatusDto, "name" | "color" | "category">
	| IssueStatus;

const LEGACY_CATEGORY: Record<IssueStatus, StatusCategory> = {
	backlog: "backlog",
	todo: "unstarted",
	in_progress: "started",
	in_review: "started",
	done: "completed",
	canceled: "canceled",
};

const LEGACY_COLOR: Record<IssueStatus, string> = {
	backlog: "#64748b",
	todo: "#3b82f6",
	in_progress: "#f59e0b",
	in_review: "#a855f7",
	done: "#22c55e",
	canceled: "#94a3b8",
};

const isLegacyStatus = (status: StatusLike): status is IssueStatus =>
	typeof status === "string";

export function StatusBadge({
	status,
	className,
}: {
	status: StatusLike;
	className?: string;
}) {
	const { t } = useTranslation();
	const legacy = isLegacyStatus(status);
	const name = legacy ? t(`issues.statuses.${status}`) : status.name;
	const color = legacy ? LEGACY_COLOR[status] : status.color;
	const category = legacy ? LEGACY_CATEGORY[status] : status.category;

	return (
		<Badge
			variant="outline"
			className={cn(
				"rounded-md border-transparent",
				category === "canceled" && "line-through opacity-70",
				className,
			)}
			style={{ backgroundColor: `${color}1f`, color }}
		>
			{name}
		</Badge>
	);
}

/** Legacy helper kept for callers that only have a status string. */
