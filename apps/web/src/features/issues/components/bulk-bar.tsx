import type { LabelDto } from "@api/dto/label.dto";
import type { StatusDto } from "@api/dto/status.dto";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MultiSelect } from "@/components/multi-select";
import { IssueDueDateField } from "@/features/issues/components/issue-due-date-field";
import {
	IssueAssigneeSelect,
	IssuePrioritySelect,
	IssueStatusSelect,
} from "@/features/issues/components/issue-selects";
import type { OrgMember } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import { fromDateInputValue } from "@/lib/format";
import {
	type BulkIssueAction,
	type BulkIssueRef,
	buildBulkUpdates,
} from "../bulk";
import { bulkPartialFailure, useBulkUpdateIssues } from "../data";

export function BulkActionBar({
	orgId,
	projectId,
	issues,
	statuses,
	members,
	labels,
	frozen,
	onDone,
}: {
	orgId: string;
	projectId: string;
	issues: BulkIssueRef[];
	statuses: StatusDto[];
	members: OrgMember[];
	labels: LabelDto[];
	frozen: boolean;
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const bulkMutation = useBulkUpdateIssues(orgId, projectId);
	const partialFailure = bulkPartialFailure(bulkMutation.error);
	const [addLabels, setAddLabels] = useState<string[]>([]);
	const [removeLabels, setRemoveLabels] = useState<string[]>([]);

	const run = (action: BulkIssueAction) => {
		const updates = buildBulkUpdates(action, issues);
		if (updates.length === 0) {
			return;
		}
		bulkMutation.mutate(updates, {
			// Keep the selection (and this bar) on failure so the inline
			// partial-failure/error message stays visible for a retry.
			onSuccess: () => {
				toast.success(t("toast.bulkUpdated", { count: updates.length }));
				onDone();
			},
		});
	};

	return (
		<div className="fixed bottom-10 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-2 shadow-xl ring-1 ring-foreground/10">
			<span className="text-sm font-medium whitespace-nowrap">
				{t("bulk.selected", { count: issues.length })}
			</span>
			<IssueStatusSelect
				statuses={statuses}
				value={null}
				disabled={frozen}
				noSelection
				placeholder={t("bulk.changeStatus")}
				triggerClassName="h-8 w-36"
				onChange={(statusId) => run({ type: "status", statusId })}
			/>
			<IssuePrioritySelect
				value={null}
				disabled={frozen}
				noSelection
				placeholder={t("bulk.changePriority")}
				triggerClassName="h-8 w-36"
				onChange={(priority) => run({ type: "priority", priority })}
			/>
			<IssueAssigneeSelect
				members={members}
				value={null}
				disabled={frozen}
				noSelection
				placeholder={t("bulk.changeAssignee")}
				triggerClassName="h-8 w-36"
				onChange={(assigneeId) => run({ type: "assignee", assigneeId })}
			/>
			<div className="w-36">
				<IssueDueDateField
					value=""
					disabled={frozen}
					className="h-8 w-full text-xs"
					onChange={(value) =>
						run({
							type: "dueDate",
							dueDate: value ? fromDateInputValue(value) : null,
						})
					}
				/>
			</div>
			<MultiSelect
				className="h-8"
				placeholder={t("bulk.addLabels")}
				value={addLabels}
				disabled={frozen}
				options={labels.map((label) => ({
					value: label.id,
					label: label.name,
				}))}
				onChange={setAddLabels}
			/>
			<MultiSelect
				className="h-8"
				placeholder={t("bulk.removeLabels")}
				value={removeLabels}
				disabled={frozen}
				options={labels.map((label) => ({
					value: label.id,
					label: label.name,
				}))}
				onChange={setRemoveLabels}
			/>
			<Button
				variant="outline"
				size="sm"
				className="h-8"
				disabled={
					frozen ||
					bulkMutation.isPending ||
					(addLabels.length === 0 && removeLabels.length === 0)
				}
				onClick={() => {
					run({
						type: "labels",
						add: addLabels,
						remove: removeLabels,
					});
					setAddLabels([]);
					setRemoveLabels([]);
				}}
			>
				{t("bulk.applyLabels")}
			</Button>
			{bulkMutation.isPending && <Spinner className="text-muted-foreground" />}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={t("bulk.clear")}
				disabled={bulkMutation.isPending}
				onClick={onDone}
			>
				<X />
			</Button>
			{bulkMutation.isError && (
				<span className="text-destructive max-w-48 truncate text-xs">
					{partialFailure
						? t("bulk.partialFailure", partialFailure)
						: apiErrorMessage(t, bulkMutation.error)}
				</span>
			)}
		</div>
	);
}
