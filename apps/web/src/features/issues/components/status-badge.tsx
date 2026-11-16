import type { StatusDto } from "@api/dto/status.dto";
import {
	DEFAULT_ISSUE_STATUSES,
	type IssueStatus,
	normalizeStatusNameKey,
	type StatusCategory,
} from "@workspace/shared";
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

const LEGACY_STATUS_META = Object.fromEntries(
	DEFAULT_ISSUE_STATUSES.map((status) => [
		normalizeStatusNameKey(status.name),
		{ category: status.category, color: status.color },
	]),
) as Record<IssueStatus, { category: StatusCategory; color: string }>;

export { LEGACY_STATUS_META };

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
	const color = legacy ? LEGACY_STATUS_META[status].color : status.color;
	const category = legacy
		? LEGACY_STATUS_META[status].category
		: status.category;

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
