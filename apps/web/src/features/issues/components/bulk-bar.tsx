import type { LabelDto } from "@api/dto/label.dto";
import type { StatusDto } from "@api/dto/status.dto";
import {
	ISSUE_PRIORITIES,
	type IssuePriorityName,
	priorityValue,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Spinner } from "@workspace/ui/components/spinner";
import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MultiSelect } from "@/components/multi-select";
import { UserAvatar } from "@/components/user-avatar";
import { IssueDueDateField } from "@/features/issues/components/issue-due-date-field";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import type { OrgMember } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import { fromDateInputValue } from "@/lib/format";
import {
	type BulkIssueAction,
	type BulkIssueRef,
	buildBulkUpdates,
} from "../bulk";
import { bulkPartialFailure, useBulkUpdateIssues } from "../data";

const NO_ACTION = "__action__";
const UNASSIGNED = "__unassigned__";

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
			<Select
				value={NO_ACTION}
				disabled={frozen}
				onValueChange={(v) =>
					v && v !== NO_ACTION && run({ type: "status", statusId: v })
				}
			>
				<SelectTrigger className="h-8 w-36">
					<SelectValue>{t("bulk.changeStatus")}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_ACTION}>{t("bulk.changeStatus")}</SelectItem>
					{statuses.map((status) => (
						<SelectItem key={status.id} value={status.id}>
							<StatusBadge status={status} />
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={NO_ACTION}
				disabled={frozen}
				onValueChange={(v) =>
					v &&
					v !== NO_ACTION &&
					run({
						type: "priority",
						priority: priorityValue(v as IssuePriorityName),
					})
				}
			>
				<SelectTrigger className="h-8 w-36">
					<SelectValue>{t("bulk.changePriority")}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_ACTION}>{t("bulk.changePriority")}</SelectItem>
					{ISSUE_PRIORITIES.map(({ name, value }) => (
						<SelectItem key={name} value={name}>
							<PriorityBadge value={value} />
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={NO_ACTION}
				disabled={frozen}
				onValueChange={(v) =>
					v &&
					v !== NO_ACTION &&
					run({
						type: "assignee",
						assigneeId: v === UNASSIGNED ? null : v,
					})
				}
			>
				<SelectTrigger className="h-8 w-36">
					<SelectValue>{t("bulk.changeAssignee")}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_ACTION}>{t("bulk.changeAssignee")}</SelectItem>
					<SelectItem value={UNASSIGNED}>{t("common.unassigned")}</SelectItem>
					{members.map((member) => (
						<SelectItem key={member.userId} value={member.userId}>
							<span className="flex items-center gap-2">
								<UserAvatar name={member.user.name} image={member.user.image} />
								{member.user.name}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
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
