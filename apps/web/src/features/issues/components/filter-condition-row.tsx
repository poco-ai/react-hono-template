import {
	ISSUE_FILTER_FIELDS,
	ISSUE_FILTER_MAX_CONDITIONS,
	type IssueFilterCondition,
	type IssueFilterField,
	type IssueFilterGroup,
	type IssueFilterNode,
	type IssueFilterOperator,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	defaultConditionFor,
	FIELD_LABEL_KEYS,
	type FilterValueSources,
	keyedFilterNodes,
	OPERATOR_LABEL_KEYS,
	operatorsForField,
	removeNode,
	replaceNode,
	resetCondition,
} from "../filter-tree";
import { filterConditionCount } from "../query";
import { ConditionValue } from "./filter-value-controls";

/** One condition: field, operator and the matching value editor. */
export function ConditionRow({
	condition,
	sources,
	onChange,
	onRemove,
}: {
	condition: IssueFilterCondition;
	sources: FilterValueSources;
	onChange: (next: IssueFilterCondition) => void;
	onRemove: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="bg-muted/30 flex flex-wrap items-center gap-1.5 rounded-md border p-2">
			<Select
				value={condition.field}
				onValueChange={(next) =>
					next &&
					onChange(
						resetCondition(
							condition,
							{ field: next as IssueFilterField },
							sources,
						),
					)
				}
			>
				<SelectTrigger className="h-8 w-32 text-sm">
					<SelectValue>{t(FIELD_LABEL_KEYS[condition.field])}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{ISSUE_FILTER_FIELDS.map((field) => (
						<SelectItem key={field} value={field}>
							{t(FIELD_LABEL_KEYS[field])}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={condition.operator}
				onValueChange={(next) =>
					next &&
					onChange(
						resetCondition(
							condition,
							{ operator: next as IssueFilterOperator },
							sources,
						),
					)
				}
			>
				<SelectTrigger className="h-8 w-28 text-sm">
					<SelectValue>
						{t(OPERATOR_LABEL_KEYS[condition.operator])}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{operatorsForField(condition.field).map((operator) => (
						<SelectItem key={operator} value={operator}>
							{t(OPERATOR_LABEL_KEYS[operator])}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<ConditionValue
				condition={condition}
				sources={sources}
				onChange={(value) => onChange({ ...condition, value })}
			/>
			<Button
				variant="ghost"
				size="icon"
				className="ml-auto size-7"
				aria-label={t("issues.filters.removeCondition")}
				onClick={onRemove}
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}

/**
 * Recursive editor for one node at `path`: renders a condition row for leaves
 * and an AND/OR group with its children otherwise. Every edit rewrites the
 * draft root so the parent stays the single owner of the tree.
 */
export function NodeEditor({
	node,
	path,
	root,
	sources,
	onDraftChange,
}: {
	node: IssueFilterNode;
	path: number[];
	root: IssueFilterGroup;
	sources: FilterValueSources;
	onDraftChange: (next: IssueFilterGroup) => void;
}) {
	const { t } = useTranslation();
	const replace = (next: IssueFilterNode) => {
		onDraftChange(replaceNode(root, path, next));
	};
	const remove = () => {
		onDraftChange(removeNode(root, path));
	};

	if (node.type === "condition") {
		return (
			<ConditionRow
				condition={node}
				sources={sources}
				onChange={replace}
				onRemove={remove}
			/>
		);
	}
	const canAddNested = filterConditionCount(root) < ISSUE_FILTER_MAX_CONDITIONS;
	return (
		<div className="rounded-md border p-2">
			<div className="mb-2 flex flex-wrap items-center gap-2">
				<Select
					value={node.op}
					onValueChange={(next) =>
						next && replace({ ...node, op: next as "and" | "or" })
					}
				>
					<SelectTrigger className="h-7 w-32 text-xs">
						<SelectValue>
							{node.op === "and"
								? t("issues.filters.matchAll")
								: t("issues.filters.matchAny")}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="and">{t("issues.filters.matchAll")}</SelectItem>
						<SelectItem value="or">{t("issues.filters.matchAny")}</SelectItem>
					</SelectContent>
				</Select>
				<Button
					variant="ghost"
					size="icon"
					className="ml-auto size-7"
					aria-label={t("issues.filters.removeGroup")}
					onClick={remove}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
			<div className="flex flex-col gap-1.5">
				{keyedFilterNodes(node.children, path).map((entry) => (
					<NodeEditor
						key={entry.key}
						node={entry.node}
						path={[...path, entry.index]}
						root={root}
						sources={sources}
						onDraftChange={onDraftChange}
					/>
				))}
				<Button
					variant="outline"
					size="sm"
					className="w-fit"
					disabled={!canAddNested}
					onClick={() =>
						replace({
							...node,
							children: [
								...node.children,
								defaultConditionFor("statusId", sources),
							],
						})
					}
				>
					<Plus className="size-3.5" />
					{t("issues.filters.addCondition")}
				</Button>
			</div>
		</div>
	);
}
