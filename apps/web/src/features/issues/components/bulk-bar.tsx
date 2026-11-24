import type { LabelDto } from "@api/features/labels/dto/label.dto";
import type { StatusDto } from "@api/features/statuses/dto/status.dto";
import { Button } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
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
import { useMediaQuery } from "@/lib/use-media-query";
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
	const isMobile = useMediaQuery("(max-width: 767px)");
	const [sheetOpen, setSheetOpen] = useState(false);
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

	const controls = (
		<BulkActionControls
			statuses={statuses}
			members={members}
			labels={labels}
			frozen={frozen}
			pending={bulkMutation.isPending}
			error={bulkMutation.error}
			partialFailure={partialFailure}
			addLabels={addLabels}
			removeLabels={removeLabels}
			onAddLabelsChange={setAddLabels}
			onRemoveLabelsChange={setRemoveLabels}
			onRun={run}
			onDone={onDone}
			stacked={isMobile}
		/>
	);

	if (isMobile) {
		// A non-modal bar above the tab bar (the mobile counterpart of the
		// desktop pill): the list stays interactive so more cards can be
		// selected, and the action sheet opens on demand. Dismissing the
		// sheet keeps the selection; only the X (or a successful run)
		// clears it.
		return (
			<>
				<div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t bg-background px-4 py-2 shadow-lg">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium whitespace-nowrap">
							{t("bulk.selected", { count: issues.length })}
						</span>
						<span className="min-w-0 flex-1" />
						{bulkMutation.isPending && (
							<Spinner className="text-muted-foreground" />
						)}
						<Button
							size="sm"
							className="h-9"
							disabled={frozen || bulkMutation.isPending}
							onClick={() => setSheetOpen(true)}
						>
							{t("common.actions")}
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							className="size-9"
							aria-label={t("bulk.clear")}
							disabled={bulkMutation.isPending}
							onClick={onDone}
						>
							<X />
						</Button>
					</div>
				</div>
				<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
					<SheetContent
						side="bottom"
						className="max-h-[85svh] gap-0 pb-[env(safe-area-inset-bottom)]"
					>
						<SheetHeader className="border-b">
							<SheetTitle>
								{t("bulk.selected", { count: issues.length })}
							</SheetTitle>
						</SheetHeader>
						<div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4">
							{controls}
						</div>
					</SheetContent>
				</Sheet>
			</>
		);
	}

	return (
		<div className="fixed bottom-10 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-2 shadow-xl ring-1 ring-foreground/10">
			<span className="text-sm font-medium whitespace-nowrap">
				{t("bulk.selected", { count: issues.length })}
			</span>
			{controls}
		</div>
	);
}

/**
 * The bulk actions themselves, shared by the desktop pill and the mobile
 * bottom sheet so both layouts run identical mutation logic.
 */
function BulkActionControls({
	statuses,
	members,
	labels,
	frozen,
	pending,
	error,
	partialFailure,
	addLabels,
	removeLabels,
	onAddLabelsChange,
	onRemoveLabelsChange,
	onRun,
	onDone,
	stacked,
}: {
	statuses: StatusDto[];
	members: OrgMember[];
	labels: LabelDto[];
	frozen: boolean;
	pending: boolean;
	error: Error | null;
	partialFailure: ReturnType<typeof bulkPartialFailure>;
	addLabels: string[];
	removeLabels: string[];
	onAddLabelsChange: (next: string[]) => void;
	onRemoveLabelsChange: (next: string[]) => void;
	onRun: (action: BulkIssueAction) => void;
	onDone: () => void;
	/** Mobile sheet layout: full-width controls stacked vertically. */
	stacked: boolean;
}) {
	const { t } = useTranslation();
	const labelOptions = labels.map((label) => ({
		value: label.id,
		label: label.name,
	}));

	return (
		<div
			className={cn(
				"flex items-center gap-2",
				// flex-wrap keeps the desktop pill wrapping exactly as it did
				// before the controls were extracted into this wrapper.
				stacked ? "flex flex-col items-stretch" : "flex-wrap",
			)}
		>
			<IssueStatusSelect
				statuses={statuses}
				value={null}
				disabled={frozen}
				noSelection
				placeholder={t("bulk.changeStatus")}
				triggerClassName={stacked ? "w-full" : "h-8 w-36"}
				onChange={(statusId) => onRun({ type: "status", statusId })}
			/>
			<IssuePrioritySelect
				value={null}
				disabled={frozen}
				noSelection
				placeholder={t("bulk.changePriority")}
				triggerClassName={stacked ? "w-full" : "h-8 w-36"}
				onChange={(priority) => onRun({ type: "priority", priority })}
			/>
			<IssueAssigneeSelect
				members={members}
				value={null}
				disabled={frozen}
				noSelection
				placeholder={t("bulk.changeAssignee")}
				triggerClassName={stacked ? "w-full" : "h-8 w-36"}
				onChange={(assigneeId) => onRun({ type: "assignee", assigneeId })}
			/>
			<div className={stacked ? "w-full" : "w-36"}>
				<IssueDueDateField
					value=""
					disabled={frozen}
					className={cn("w-full", stacked ? "text-sm" : "h-8 text-xs")}
					onChange={(value) =>
						onRun({
							type: "dueDate",
							dueDate: value ? fromDateInputValue(value) : null,
						})
					}
				/>
			</div>
			<MultiSelect
				className={stacked ? "w-full" : "h-8"}
				placeholder={t("bulk.addLabels")}
				value={addLabels}
				disabled={frozen}
				options={labelOptions}
				onChange={onAddLabelsChange}
			/>
			<MultiSelect
				className={stacked ? "w-full" : "h-8"}
				placeholder={t("bulk.removeLabels")}
				value={removeLabels}
				disabled={frozen}
				options={labelOptions}
				onChange={onRemoveLabelsChange}
			/>
			<Button
				variant="outline"
				size="sm"
				className={cn("h-8", stacked && "w-full")}
				disabled={
					frozen ||
					pending ||
					(addLabels.length === 0 && removeLabels.length === 0)
				}
				onClick={() => {
					onRun({
						type: "labels",
						add: addLabels,
						remove: removeLabels,
					});
					onAddLabelsChange([]);
					onRemoveLabelsChange([]);
				}}
			>
				{t("bulk.applyLabels")}
			</Button>
			{pending && <Spinner className="text-muted-foreground" />}
			{!stacked && (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("bulk.clear")}
					disabled={pending}
					onClick={onDone}
				>
					<X />
				</Button>
			)}
			{error && (
				<span
					className={cn(
						"text-destructive text-xs",
						!stacked && "max-w-48 truncate",
					)}
				>
					{partialFailure
						? t("bulk.partialFailure", partialFailure)
						: apiErrorMessage(t, error)}
				</span>
			)}
		</div>
	);
}
