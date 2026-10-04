import type { IssueDetailDto } from "@api/dto/issue.dto";
import type { LabelDto } from "@api/dto/label.dto";
import {
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
	priorityName,
	priorityValue,
	type UpdateIssueInput,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MultiSelect } from "@/components/multi-select";
import { DateField } from "@/features/issues/components/date-field";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import { LabelBadge } from "@/features/labels/components/label-badge";
import { fromDateInputValue, toDateInputValue } from "@/lib/format";

const UNASSIGNED = "__unassigned__";

export function IssuePropertiesPanel({
	issue,
	members,
	labels,
	frozen,
	onUpdate,
	onDelete,
}: {
	issue: IssueDetailDto;
	members: { userId: string; user: { name: string } }[];
	labels: LabelDto[];
	frozen: boolean;
	onUpdate: (input: UpdateIssueInput) => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const [estimateDraft, setEstimateDraft] = useState("");

	useEffect(() => {
		setEstimateDraft(
			issue.estimate === null || issue.estimate === undefined
				? ""
				: String(issue.estimate),
		);
	}, [issue.estimate]);

	const memberById = new Map(members.map((member) => [member.userId, member]));
	const assigneeLabel = issue.assigneeId
		? (memberById.get(issue.assigneeId)?.user.name ?? t("common.unassigned"))
		: t("common.unassigned");

	return (
		<>
			<div className="flex justify-end">
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger
							render={
								<DropdownMenuTrigger
									render={
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={t("common.actions")}
										>
											<MoreHorizontal />
										</Button>
									}
								/>
							}
						/>
						<TooltipContent>{t("common.actions")}</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							disabled={frozen}
							onClick={onDelete}
						>
							<Trash2 />
							{t("issues.deleteAction")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<PropertyRow label={t("issues.status")}>
				<Select
					value={issue.status as IssueStatus}
					disabled={frozen}
					onValueChange={(v) =>
						v && onUpdate({ status: v as (typeof ISSUE_STATUSES)[number] })
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue>
							{t(`issues.statuses.${issue.status as IssueStatus}`)}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{ISSUE_STATUSES.map((status) => (
							<SelectItem key={status} value={status}>
								<StatusBadge status={status} />
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PropertyRow>

			<PropertyRow label={t("issues.priority")}>
				<Select
					value={priorityName(issue.priority)}
					disabled={frozen}
					onValueChange={(v) =>
						v &&
						onUpdate({
							priority: priorityValue(v as IssuePriorityName),
						})
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue>
							{t(`issues.priorities.${priorityName(issue.priority)}`)}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{ISSUE_PRIORITIES.map(({ name, value }) => (
							<SelectItem key={name} value={name}>
								<PriorityBadge value={value} />
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PropertyRow>

			<PropertyRow label={t("issues.assignee")}>
				<Select
					value={issue.assigneeId ?? UNASSIGNED}
					disabled={frozen}
					onValueChange={(v) =>
						onUpdate({ assigneeId: v === UNASSIGNED ? null : v })
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue>{assigneeLabel}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={UNASSIGNED}>{t("common.unassigned")}</SelectItem>
						{members.map((member) => (
							<SelectItem key={member.userId} value={member.userId}>
								{member.user.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PropertyRow>

			<PropertyRow label={t("issues.labels")}>
				<MultiSelect
					className="w-full justify-between"
					placeholder={t("issues.noLabels")}
					triggerLabel={
						issue.labelIds.length > 0
							? `${t("issues.labels")} · ${issue.labelIds.length}`
							: undefined
					}
					value={issue.labelIds}
					disabled={frozen}
					options={labels.map((label) => ({
						value: label.id,
						label: label.name,
					}))}
					onChange={(next) => onUpdate({ labelIds: next })}
				/>
				{issue.labelIds.length > 0 && (
					<span className="mt-2 flex flex-wrap gap-1">
						{issue.labelIds.map((labelId) => {
							const label = labels.find((l) => l.id === labelId);
							return label ? <LabelBadge key={labelId} label={label} /> : null;
						})}
					</span>
				)}
			</PropertyRow>

			<PropertyRow label={t("issues.dueDate")}>
				<DateField
					value={toDateInputValue(issue.dueDate)}
					disabled={frozen}
					onChange={(v) => onUpdate({ dueDate: fromDateInputValue(v) })}
				/>
			</PropertyRow>

			<PropertyRow label={t("issues.estimate")}>
				<Input
					type="number"
					min={0}
					max={100}
					value={estimateDraft}
					disabled={frozen}
					onChange={(e) => setEstimateDraft(e.target.value)}
					onBlur={() => {
						if (estimateDraft === "") {
							if (issue.estimate !== null) {
								onUpdate({ estimate: null });
							}
							return;
						}
						const parsed = Number(estimateDraft);
						if (
							Number.isInteger(parsed) &&
							parsed >= 0 &&
							parsed <= 100 &&
							parsed !== issue.estimate
						) {
							onUpdate({ estimate: parsed });
						} else {
							setEstimateDraft(
								issue.estimate === null ? "" : String(issue.estimate),
							);
						}
					}}
				/>
				<p className="text-muted-foreground text-xs">
					{t("issues.estimateUnit")}
				</p>
			</PropertyRow>
		</>
	);
}

function PropertyRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-muted-foreground text-xs">{label}</Label>
			{children}
		</div>
	);
}
