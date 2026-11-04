import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CalendarRange, ChevronRight, ListTodo } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CycleProgress } from "@/features/cycles/components/cycle-progress";
import { currentCycleQuery } from "@/features/cycles/data";
import { formatUtcDate } from "@/lib/format";

/**
 * Compact "current cycle" strip shown in the project header. Renders nothing
 * when the project has no running cycle, so empty projects keep a clean header.
 */
export function CurrentCycleCard({
	orgId,
	projectId,
}: {
	orgId: string;
	projectId: string;
}) {
	const { t } = useTranslation();
	const current = useQuery(currentCycleQuery(orgId, projectId));

	if (current.isPending) {
		return (
			<Card className="max-w-2xl gap-0 py-0" aria-busy="true">
				<CardHeader className="gap-2 px-4 py-3">
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-3 w-full" />
				</CardHeader>
			</Card>
		);
	}

	const cycle = current.data?.items[0];
	if (!cycle) {
		return null;
	}

	return (
		<Card className="max-w-2xl gap-0 py-0">
			<CardHeader className="gap-2 px-4 py-3">
				<div className="flex flex-wrap items-center gap-2">
					<CalendarRange className="text-muted-foreground size-4" />
					<CardTitle className="text-base">{cycle.name}</CardTitle>
					<Badge variant="secondary" className="rounded-md">
						{t("cycles.status.current")}
					</Badge>
					<span className="text-muted-foreground ml-auto text-xs">
						{t("cycles.dateRange", {
							start: formatUtcDate(cycle.startsAt),
							end: formatUtcDate(cycle.endsAt),
						})}
					</span>
				</div>
				<CycleProgress cycle={cycle} />
			</CardHeader>
			<CardContent className="flex flex-wrap items-center gap-2 px-4 pb-3">
				<Link
					to="/orgs/$orgId/projects/$projectId"
					params={{ orgId, projectId }}
					search={{ page: 1, sort: "updated", cycleId: cycle.id }}
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<ListTodo className="size-4" />
					{t("cycles.viewIssues")}
				</Link>
				<Link
					to="/orgs/$orgId/projects/$projectId/cycles"
					params={{ orgId, projectId }}
					className={buttonVariants({ variant: "ghost", size: "sm" })}
				>
					{t("cycles.manage")}
					<ChevronRight className="size-4" />
				</Link>
			</CardContent>
		</Card>
	);
}
