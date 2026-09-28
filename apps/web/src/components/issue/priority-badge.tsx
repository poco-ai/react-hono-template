import type { IssuePriorityName } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { priorityName } from "@/lib/issue-utils";

const PRIORITY_CLASS: Record<IssuePriorityName, string> = {
	none: "bg-muted text-muted-foreground",
	urgent: "bg-red-500/10 text-red-600 dark:text-red-400",
	high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
	medium: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	low: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

export function PriorityBadge({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	const { t } = useTranslation();
	const name = priorityName(value);
	return (
		<Badge
			variant="outline"
			className={cn("border-transparent", PRIORITY_CLASS[name], className)}
		>
			{t(`issues.priorities.${name}`)}
		</Badge>
	);
}
