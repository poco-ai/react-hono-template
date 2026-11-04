import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { ArrowRightLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CycleProgress } from "@/features/cycles/components/cycle-progress";
import type { CycleWithProgressDto } from "@/features/cycles/data";
import { formatUtcDate } from "@/lib/format";

/** One cycle row/card with progress, dates and management actions. */
export function CycleCard({
	orgId,
	projectId,
	cycle,
	frozen,
	canManage,
	onEdit,
	onDelete,
	onRollover,
}: {
	orgId: string;
	projectId: string;
	cycle: CycleWithProgressDto;
	frozen: boolean;
	/** Cycle writes are owner/admin only, matching the API. */
	canManage: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onRollover: () => void;
}) {
	const { t } = useTranslation();

	return (
		<Card className="gap-0 py-0">
			<CardHeader className="gap-2 px-4 pt-4 pb-3">
				<div className="flex items-center gap-2">
					<CardTitle className="truncate text-base">{cycle.name}</CardTitle>
					<Badge variant="outline" className="shrink-0 rounded-md font-mono">
						#{cycle.number}
					</Badge>
					<Badge variant="secondary" className="shrink-0 rounded-md">
						{t(`cycles.status.${cycle.status}`)}
					</Badge>
					{canManage && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="ghost"
										size="icon-sm"
										className="ml-auto"
										aria-label={t("common.actions")}
									/>
								}
							>
								<MoreHorizontal className="size-4" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem disabled={frozen} onClick={onEdit}>
									<Pencil />
									{t("cycles.edit")}
								</DropdownMenuItem>
								<DropdownMenuItem disabled={frozen} onClick={onRollover}>
									<ArrowRightLeft />
									{t("cycles.rollover")}
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									disabled={frozen}
									onClick={onDelete}
								>
									<Trash2 />
									{t("cycles.delete")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
				<p className="text-muted-foreground text-xs">
					{t("cycles.dateRange", {
						start: formatUtcDate(cycle.startsAt),
						end: formatUtcDate(cycle.endsAt),
					})}
				</p>
				<CycleProgress cycle={cycle} />
			</CardHeader>
			<CardContent className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
				<span className="text-muted-foreground text-xs">
					{t("cycles.issueCount", { count: cycle.progress.total })}
				</span>
				<Link
					to="/orgs/$orgId/projects/$projectId"
					params={{ orgId, projectId }}
					search={{ page: 1, sort: "updated", cycleId: cycle.id }}
					className={buttonVariants({ variant: "link", size: "sm" })}
				>
					{t("cycles.viewIssues")}
				</Link>
			</CardContent>
		</Card>
	);
}
