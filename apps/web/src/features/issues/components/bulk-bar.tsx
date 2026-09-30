import {
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
	priorityValue,
	type UpdateIssueInput,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { apiErrorMessage } from "@/lib/errors";
import { bulkPartialFailure, useBulkUpdateIssues } from "../data";

const PRIORITY_NAMES = ISSUE_PRIORITIES.map((p) => p.name);
const NO_ACTION = "__action__";

export function BulkActionBar({
	orgId,
	projectId,
	numbers,
	frozen,
	onDone,
}: {
	orgId: string;
	projectId: string;
	numbers: number[];
	frozen: boolean;
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const bulkMutation = useBulkUpdateIssues(orgId, projectId);
	const partialFailure = bulkPartialFailure(bulkMutation.error);
	const updateSelected = (input: UpdateIssueInput) =>
		bulkMutation.mutate(
			{ numbers, input },
			{
				onSuccess: (_data, variables) =>
					toast.success(
						t("toast.bulkUpdated", { count: variables.numbers.length }),
					),
				onSettled: onDone,
			},
		);

	return (
		<div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border bg-background px-4 py-2 shadow-lg">
			<span className="text-sm font-medium whitespace-nowrap">
				{t("bulk.selected", { count: numbers.length })}
			</span>
			<Select
				value={NO_ACTION}
				disabled={frozen}
				onValueChange={(v) => v && updateSelected({ status: v as IssueStatus })}
			>
				<SelectTrigger className="h-8 w-36">
					<SelectValue>{t("bulk.changeStatus")}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_ACTION}>{t("bulk.changeStatus")}</SelectItem>
					{ISSUE_STATUSES.map((status) => (
						<SelectItem key={status} value={status}>
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
					updateSelected({
						priority: priorityValue(v as IssuePriorityName),
					})
				}
			>
				<SelectTrigger className="h-8 w-36">
					<SelectValue>{t("bulk.changePriority")}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_ACTION}>{t("bulk.changePriority")}</SelectItem>
					{PRIORITY_NAMES.map((name) => (
						<SelectItem key={name} value={name}>
							<PriorityBadge value={priorityValue(name)} />
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{bulkMutation.isPending && (
				<Loader2 className="text-muted-foreground size-4 animate-spin" />
			)}
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
