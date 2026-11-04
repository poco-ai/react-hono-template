import type { StatusDto } from "@api/dto/status.dto";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@workspace/ui/components/item";
import { Progress, ProgressLabel } from "@workspace/ui/components/progress";
import { ListPlus, ListTree } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { CreateIssueDialog } from "@/features/issues/components/create-issue-dialog";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { subIssueParentId } from "@/features/issues/create-issue-input";
import type { OrgMember } from "@/features/members/data";

export function SubIssuesSection({
	orgId,
	projectId,
	projectKey,
	issueId,
	isSubIssue,
	subIssues,
	progress,
	frozen,
	members,
	labels,
	statuses,
}: {
	orgId: string;
	projectId: string;
	projectKey: string;
	/** Real id of the issue whose detail page is open. */
	issueId: string;
	/** True when the current issue already has a parent (no third level). */
	isSubIssue: boolean;
	subIssues: {
		id: string;
		number: number;
		title: string;
		status: StatusDto;
		priority: number;
	}[];
	progress: { done: number; total: number };
	frozen: boolean;
	members: OrgMember[];
	labels: { id: string; name: string }[];
	statuses: StatusDto[];
}) {
	const { t } = useTranslation();
	const [createOpen, setCreateOpen] = useState(false);
	const percent =
		progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="font-heading text-base font-medium">
						{t("issues.subIssues.title")}
					</h2>
					<p className="text-muted-foreground text-sm">
						{isSubIssue
							? t("issues.subIssues.nestedDescription")
							: t("issues.subIssues.description")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={frozen || isSubIssue}
					onClick={() => setCreateOpen(true)}
				>
					<ListPlus className="size-4" />
					{t("issues.subIssues.add")}
				</Button>
			</div>

			{progress.total > 0 ? (
				<Progress value={percent}>
					<ProgressLabel>
						{t("issues.subIssues.progress", {
							done: progress.done,
							total: progress.total,
						})}
					</ProgressLabel>
				</Progress>
			) : null}

			{subIssues.length === 0 ? (
				<EmptyState
					icon={ListTree}
					title={t("issues.subIssues.empty")}
					description={t("issues.subIssues.description")}
				/>
			) : (
				<ItemGroup>
					{subIssues.map((child) => (
						<Item
							key={child.id}
							variant="outline"
							render={
								<Link
									to="/orgs/$orgId/projects/$projectId/$issueNumber"
									params={{
										orgId,
										projectId,
										issueNumber: String(child.number),
									}}
								/>
							}
						>
							<ItemContent>
								<ItemTitle>{child.title}</ItemTitle>
								<ItemDescription className="font-mono text-xs">
									{projectKey}-{child.number}
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								<StatusBadge status={child.status} />
								<PriorityBadge value={child.priority} />
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			)}

			<CreateIssueDialog
				orgId={orgId}
				projectId={projectId}
				parentId={subIssueParentId({ issueId, isSubIssue })}
				open={createOpen}
				onOpenChange={setCreateOpen}
				defaultStatusId={statuses.find((status) => status.isDefault)?.id}
				members={members}
				labels={labels}
				statuses={statuses}
			/>
		</section>
	);
}
