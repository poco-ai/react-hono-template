import type { StatusDto } from "@api/dto/status.dto";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { useTranslation } from "react-i18next";
import { ISSUE_SEARCH_MIN_LENGTH } from "@/features/issues/data";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";

/** Minimum shape an issue needs to be shown in (and picked from) the search list. */
export type PickableIssue = {
	id: string;
	number: number;
	title: string;
	status: StatusDto;
	priority: number;
};

/**
 * Issue search list shared by the parent and relation pickers: debounced term
 * comes from the caller (it owns the `issueSearchQuery`), this component only
 * renders the hint/empty/result states and the identical result row.
 */
export function IssueSearchPicker({
	searchInputId,
	searchLabel,
	searchPlaceholder,
	hint,
	noResults,
	term,
	onTermChange,
	results,
	isFetching,
	selectedId,
	onSelect,
	projectKey,
}: {
	/** Id of the search input, used by the caller's `FieldLabel`. */
	searchInputId: string;
	searchLabel: string;
	searchPlaceholder: string;
	/** Shown until the term reaches `ISSUE_SEARCH_MIN_LENGTH`; already translated. */
	hint: string;
	noResults: string;
	term: string;
	onTermChange: (term: string) => void;
	results: PickableIssue[];
	isFetching: boolean;
	selectedId: string | null;
	onSelect: (issue: PickableIssue) => void;
	projectKey: string;
}) {
	const { t } = useTranslation();

	return (
		<Field>
			<FieldLabel htmlFor={searchInputId}>{searchLabel}</FieldLabel>
			<Command
				shouldFilter={false}
				className="rounded-lg border bg-transparent"
			>
				<CommandInput
					id={searchInputId}
					value={term}
					onValueChange={onTermChange}
					placeholder={searchPlaceholder}
				/>
				<CommandList>
					{term.trim().length < ISSUE_SEARCH_MIN_LENGTH ? (
						<div className="text-muted-foreground py-6 text-center text-sm">
							{hint}
						</div>
					) : (
						<>
							<CommandEmpty>
								{isFetching ? t("common.loading") : noResults}
							</CommandEmpty>
							<CommandGroup>
								{results.map((issue) => {
									const isSelected = selectedId === issue.id;
									return (
										<CommandItem
											key={issue.id}
											value={issue.id}
											aria-current={isSelected ? "true" : undefined}
											className="aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground"
											onSelect={() => onSelect(issue)}
										>
											<span className="font-mono text-xs">
												{projectKey}-{issue.number}
											</span>
											<span className="truncate">{issue.title}</span>
											<span className="ml-auto flex items-center gap-1.5">
												<StatusBadge status={issue.status} />
												<PriorityBadge value={issue.priority} />
											</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</>
					)}
				</CommandList>
			</Command>
		</Field>
	);
}
