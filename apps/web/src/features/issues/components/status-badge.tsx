import type { IssueStatus } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { useTranslation } from "react-i18next";

const STATUS_CLASS: Record<IssueStatus, string> = {
	backlog: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
	todo: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	in_progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	in_review: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
	done: "bg-green-500/10 text-green-600 dark:text-green-400",
	canceled: "bg-muted text-muted-foreground line-through",
};

export function StatusBadge({
	status,
	className,
}: {
	status: IssueStatus;
	className?: string;
}) {
	const { t } = useTranslation();
	return (
		<Badge
			variant="outline"
			className={cn(
				"rounded-md border-transparent",
				STATUS_CLASS[status],
				className,
			)}
		>
			{t(`issues.statuses.${status}`)}
		</Badge>
	);
}
