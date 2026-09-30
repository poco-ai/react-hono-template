import type { LabelDto } from "@api/dto/label.dto";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronDown, CircleAlert, History } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/user-avatar";
import { issueActivitiesQuery } from "@/features/activities/data";
import { ActivitySentence } from "@/features/issues/components/activity-sentence";
import type { OrgMember } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/issue-utils";

export function IssueActivityTimeline({
	orgId,
	projectId,
	issueNumber,
	members,
	labels,
}: {
	orgId: string;
	projectId: string;
	issueNumber: number;
	members: OrgMember[];
	labels: LabelDto[];
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const activities = useQuery(
		issueActivitiesQuery(orgId, projectId, issueNumber),
	);

	return (
		<section className="flex flex-col gap-3">
			<Button
				variant="ghost"
				size="sm"
				className="text-muted-foreground hover:text-foreground w-fit gap-2 px-2"
				onClick={() => setOpen((prev) => !prev)}
			>
				<History className="size-4" />
				{t("activity.title")}
				<ChevronDown
					className={cn("size-4 transition-transform", open && "rotate-180")}
				/>
			</Button>
			{open &&
				(activities.isPending ? (
					<p className="text-muted-foreground px-2 text-sm">
						{t("common.loading")}
					</p>
				) : activities.isError ? (
					<Alert variant="destructive" className="mx-2">
						<CircleAlert />
						<AlertDescription>
							{apiErrorMessage(t, activities.error)}
						</AlertDescription>
					</Alert>
				) : (activities.data ?? []).length === 0 ? (
					<p className="text-muted-foreground px-2 text-sm">
						{t("activity.empty")}
					</p>
				) : (
					<ol className="flex flex-col">
						{(activities.data ?? []).map((activity) => (
							<li
								key={activity.id}
								className="relative flex gap-3 pb-4 last:pb-0"
							>
								<span className="absolute top-5 bottom-0 left-[9px] w-px bg-border last:hidden" />
								<UserAvatar name={activity.actor.name} />
								<div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
									<ActivitySentence
										activity={activity}
										members={members}
										labels={labels}
									/>
									<time
										dateTime={activity.createdAt}
										title={formatDateTime(activity.createdAt)}
										className="text-muted-foreground text-xs"
									>
										{formatRelativeTime(activity.createdAt)}
									</time>
								</div>
							</li>
						))}
					</ol>
				))}
		</section>
	);
}
