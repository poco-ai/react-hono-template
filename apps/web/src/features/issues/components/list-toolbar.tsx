import {
	ISSUE_QUERY_GROUP_BY,
	type IssueQueryGroupBy,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Columns3, Group, Rows3, Rows4 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	ISSUE_LIST_COLUMNS,
	type IssueListColumn,
	type IssueListDensity,
} from "../list-preferences";

/** List-only display controls: grouping, density and visible columns. */
const GROUP_LABEL = {
	none: "issues.group.none",
	status: "issues.group.status",
	assignee: "issues.group.assignee",
	priority: "issues.group.priority",
	label: "issues.group.label",
} as const satisfies Record<IssueQueryGroupBy | "none", string>;

const COLUMN_LABEL = {
	status: "issues.columns.status",
	priority: "issues.columns.priority",
	assignee: "issues.columns.assignee",
	labels: "issues.columns.labels",
	dueDate: "issues.columns.dueDate",
	createdAt: "issues.columns.createdAt",
	updatedAt: "issues.columns.updatedAt",
	estimate: "issues.columns.estimate",
} as const satisfies Record<IssueListColumn, string>;

export function IssueListToolbar({
	groupBy,
	onGroupByChange,
	density,
	onDensityChange,
	columns,
	onToggleColumn,
}: {
	groupBy: IssueQueryGroupBy | undefined;
	onGroupByChange: (next: IssueQueryGroupBy | undefined) => void;
	density: IssueListDensity;
	onDensityChange: (next: IssueListDensity) => void;
	columns: readonly IssueListColumn[];
	onToggleColumn: (column: IssueListColumn, checked: boolean) => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="flex items-center gap-1">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="outline" size="sm">
							<Group />
							<span className="max-sm:hidden">
								{t(GROUP_LABEL[groupBy ?? "none"])}
							</span>
						</Button>
					}
				/>
				<DropdownMenuContent align="start" className="min-w-40">
					<DropdownMenuLabel>{t("issues.groupBy")}</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={groupBy ?? "none"}
						onValueChange={(value) =>
							onGroupByChange(
								value === "none" ? undefined : (value as IssueQueryGroupBy),
							)
						}
					>
						<DropdownMenuRadioItem value="none">
							{t("issues.group.none")}
						</DropdownMenuRadioItem>
						{ISSUE_QUERY_GROUP_BY.map((value) => (
							<DropdownMenuRadioItem key={value} value={value}>
								{t(GROUP_LABEL[value])}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="outline"
							size="icon-sm"
							aria-label={t("issues.density.label")}
							title={t("issues.density.label")}
						>
							{density === "compact" ? <Rows4 /> : <Rows3 />}
						</Button>
					}
				/>
				<DropdownMenuContent align="start" className="min-w-36">
					<DropdownMenuLabel>{t("issues.density.label")}</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={density}
						onValueChange={(value) =>
							onDensityChange(value as IssueListDensity)
						}
					>
						<DropdownMenuRadioItem value="comfortable">
							{t("issues.density.comfortable")}
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="compact">
							{t("issues.density.compact")}
						</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="outline" size="sm">
							<Columns3 />
							<span className="max-sm:hidden">{t("issues.columns.label")}</span>
						</Button>
					}
				/>
				<DropdownMenuContent align="end" className="min-w-44">
					<DropdownMenuLabel>{t("issues.columns.label")}</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{ISSUE_LIST_COLUMNS.map((column) => {
						const checked = columns.includes(column);
						return (
							<DropdownMenuCheckboxItem
								key={column}
								checked={checked}
								closeOnClick={false}
								disabled={checked && columns.length <= 1}
								onCheckedChange={(value) => onToggleColumn(column, value)}
							>
								{t(COLUMN_LABEL[column])}
							</DropdownMenuCheckboxItem>
						);
					})}
					<DropdownMenuSeparator />
					<DropdownMenuItem disabled className="text-xs">
						{t("issues.columns.hint")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
