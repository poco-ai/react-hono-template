import {
	ISSUE_FILTER_MAX_CONDITIONS,
	type IssueFilterCondition,
	type IssueFilterGroup,
	type IssueFilterScalar,
	issueFilterNodeSchema,
	priorityName,
} from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import { ListFilter, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	defaultConditionFor,
	emptyFilter,
	FIELD_LABEL_KEYS,
	type FilterValueSources,
	isNullOperator,
	keyedFilterNodes,
	OPERATOR_LABEL_KEYS,
	removeNode,
} from "../filter-tree";
import { filterConditionCount, filterScalarLabel } from "../query";
import { NodeEditor } from "./filter-condition-row";

interface QueryBuilderProps extends FilterValueSources {
	filter?: IssueFilterGroup;
	onChange: (next: IssueFilterGroup | undefined) => void;
	stacked?: boolean;
}

/**
 * Structured AND/OR filter editor. Changes stay in a local draft until Apply
 * so a partially edited condition never hits the issue list.
 */
export function IssueQueryBuilder({
	filter,
	statuses,
	members,
	labels,
	projects,
	cycles,
	onChange,
	stacked,
}: QueryBuilderProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<IssueFilterGroup>(filter ?? emptyFilter());
	const sources: FilterValueSources = {
		statuses,
		members,
		labels,
		projects,
		cycles,
	};
	const appliedFilter = filter ?? emptyFilter();
	const appliedKey = JSON.stringify(appliedFilter);

	// Re-clone when the applied filter's content changes (not its identity), so
	// the draft never shares nested nodes with the applied tree.
	// biome-ignore lint/correctness/useExhaustiveDependencies: appliedKey tracks the applied content
	useEffect(() => {
		if (!open) {
			setDraft(structuredClone(appliedFilter));
		}
	}, [open, appliedKey]);

	const draftKey = JSON.stringify(draft);
	const pending = appliedKey !== draftKey;
	const empty = draft.children.length === 0;
	const validation = empty
		? { success: true as const }
		: issueFilterNodeSchema.safeParse(draft);
	const conditionCount = filterConditionCount(draft);
	const canAddCondition = conditionCount < ISSUE_FILTER_MAX_CONDITIONS;

	const addCondition = () => {
		if (!canAddCondition) {
			return;
		}
		setDraft((current) => ({
			...current,
			children: [...current.children, defaultConditionFor("statusId", sources)],
		}));
	};

	const addGroup = () => {
		if (!canAddCondition) {
			return;
		}
		setDraft((current) => ({
			...current,
			children: [
				...current.children,
				{
					type: "group",
					op: "or",
					children: [
						defaultConditionFor("statusId", sources),
						defaultConditionFor("priority", sources),
					],
				},
			],
		}));
	};

	const apply = () => {
		onChange(empty ? undefined : draft);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setDraft(filter ? structuredClone(filter) : emptyFilter());
				}
			}}
		>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className={cn(
							"h-8 gap-1.5 text-sm",
							stacked && "w-full justify-start",
							(filter?.children.length ?? 0) > 0 && "border-foreground/30",
						)}
					/>
				}
			>
				<ListFilter className="size-4" />
				{t("issues.filters.add")}
				{conditionCount > 0 && (
					<Badge variant="secondary" className="rounded-full px-1.5 text-xs">
						{conditionCount}
					</Badge>
				)}
				{pending && (
					<Badge variant="outline" className="rounded-full px-1.5 text-xs">
						{t("issues.filters.pendingBadge")}
					</Badge>
				)}
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="max-h-[70svh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-xs">
						{t("issues.filters.matchLabel")}
					</span>
					<Select
						value={draft.op}
						onValueChange={(next) =>
							next && setDraft({ ...draft, op: next as "and" | "or" })
						}
					>
						<SelectTrigger className="h-7 w-32 text-xs">
							<SelectValue>
								{draft.op === "and"
									? t("issues.filters.matchAll")
									: t("issues.filters.matchAny")}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="and">
								{t("issues.filters.matchAll")}
							</SelectItem>
							<SelectItem value="or">{t("issues.filters.matchAny")}</SelectItem>
						</SelectContent>
					</Select>
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto"
						disabled={empty}
						onClick={() => setDraft(emptyFilter())}
					>
						{t("issues.filters.clearAll")}
					</Button>
				</div>

				<div className="flex flex-col gap-1.5">
					{keyedFilterNodes(draft.children).map((entry) => (
						<NodeEditor
							key={entry.key}
							node={entry.node}
							path={[entry.index]}
							root={draft}
							sources={sources}
							onDraftChange={setDraft}
						/>
					))}
					{empty && (
						<p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
							{t("issues.filters.empty")}
						</p>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						disabled={!canAddCondition}
						onClick={addCondition}
					>
						<Plus className="size-3.5" />
						{t("issues.filters.addCondition")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!canAddCondition}
						onClick={addGroup}
					>
						<Plus className="size-3.5" />
						{t("issues.filters.addGroup")}
					</Button>
					<span className="text-muted-foreground ml-auto text-xs">
						{t("issues.filters.conditionCount", {
							count: conditionCount,
							max: ISSUE_FILTER_MAX_CONDITIONS,
						})}
					</span>
				</div>

				{!validation.success && (
					<p className="text-destructive text-xs">
						{t("issues.filters.invalid")}
					</p>
				)}

				<div className="flex items-center justify-end gap-2 border-t pt-2">
					<span className="text-muted-foreground mr-auto text-xs">
						{pending
							? t("issues.filters.pending", { count: conditionCount })
							: t("issues.filters.noPending")}
					</span>
					<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
						{t("common.cancel")}
					</Button>
					<Button size="sm" disabled={!validation.success} onClick={apply}>
						{t("issues.filters.apply")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

/** Removable chips for the applied root conditions. */
export function IssueFilterChips({
	filter,
	statuses,
	members,
	labels,
	projects,
	cycles,
	onChange,
	className,
}: FilterValueSources & {
	filter?: IssueFilterGroup;
	onChange: (next: IssueFilterGroup | undefined) => void;
	className?: string;
}) {
	const { t } = useTranslation();
	const sourceMaps = {
		statuses: new Map(statuses.map((status) => [status.id, status.name])),
		members: new Map(
			members.map((member) => [member.userId, member.user.name]),
		),
		labels: new Map(labels.map((label) => [label.id, label.name])),
		projects: new Map(
			projects.map((project) => [
				project.id,
				`${project.key} · ${project.name}`,
			]),
		),
		cycles: new Map(cycles.map((cycle) => [cycle.id, cycle.name])),
	};

	const valueLabel = (condition: IssueFilterCondition) => {
		if (isNullOperator(condition.operator)) {
			return null;
		}
		const values = Array.isArray(condition.value)
			? condition.value
			: condition.value === undefined
				? []
				: [condition.value];
		const field = condition.field;
		const labelsFor = (value: IssueFilterScalar) => {
			const raw = String(value);
			if (field === "statusId") {
				return sourceMaps.statuses.get(raw) ?? raw;
			}
			if (field === "assigneeId" || field === "createdById") {
				return sourceMaps.members.get(raw) ?? raw;
			}
			if (field === "labelId") {
				return sourceMaps.labels.get(raw) ?? raw;
			}
			if (field === "projectId") {
				return sourceMaps.projects.get(raw) ?? raw;
			}
			if (field === "cycleId") {
				return sourceMaps.cycles.get(raw) ?? raw;
			}
			if (field === "priority") {
				return t(`issues.priorities.${priorityName(Number(value))}`);
			}
			return filterScalarLabel(field, value);
		};
		return values.map(labelsFor).join(", ");
	};

	if (!filter || filter.children.length === 0) {
		return null;
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-1.5", className)}>
			{keyedFilterNodes(filter.children).map((entry) => {
				const { index, node } = entry;
				const summary =
					node.type === "group"
						? t("issues.filters.groupChip", {
								count: filterConditionCount(node),
							})
						: [
								t(FIELD_LABEL_KEYS[node.field]),
								t(OPERATOR_LABEL_KEYS[node.operator]),
								valueLabel(node),
							]
								.filter(Boolean)
								.join(" ");
				return (
					<Badge
						key={entry.key}
						variant="secondary"
						className="gap-1 rounded-md"
					>
						<span className="max-w-64 truncate">{summary}</span>
						<Button
							variant="ghost"
							size="icon"
							className="text-muted-foreground hover:text-foreground size-4"
							aria-label={t("issues.filters.removeCondition")}
							onClick={() => {
								const next = removeNode(filter, [index]);
								onChange(next.children.length > 0 ? next : undefined);
							}}
						>
							<X className="size-3" />
						</Button>
					</Badge>
				);
			})}
		</div>
	);
}
