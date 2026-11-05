import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MutationError } from "@/components/mutation-error";
import {
	ISSUE_PICKER_PAGE_SIZE,
	ISSUE_SEARCH_MIN_LENGTH,
	issueSearchQuery,
} from "@/features/issues/data";
import { IssueSearchPicker, type PickableIssue } from "./issue-search-picker";

/** Current parent summary shown by the property. */
export type ParentSummary = PickableIssue;

/**
 * "Parent issue" property: shows the current parent with a detach action and,
 * when the issue has no sub-issues itself, a search dialog to attach one.
 * The search reuses the issue search query scoped to the project.
 */
export function ParentIssueField({
	orgId,
	projectId,
	projectKey,
	issueId,
	parent,
	canSetParent,
	frozen,
	onChange,
}: {
	orgId: string;
	projectId: string;
	projectKey: string;
	issueId: string;
	parent: ParentSummary | null;
	/** False when the issue already has sub-issues (two-level limit). */
	canSetParent: boolean;
	frozen: boolean;
	onChange: (parentId: string | null) => void;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [term, setTerm] = useState("");
	const [selected, setSelected] = useState<ParentSummary | null>(null);

	const search = useQuery(
		issueSearchQuery(orgId, term, {
			projectId,
			pageSize: ISSUE_PICKER_PAGE_SIZE,
		}),
	);
	const results = (search.data?.items ?? []).filter(
		(issue) => issue.id !== issueId,
	);

	const close = () => {
		setOpen(false);
		setTerm("");
		setSelected(null);
	};

	const submit = () => {
		if (!selected) {
			return;
		}
		onChange(selected.id);
		close();
	};

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-muted-foreground text-xs">
				{t("issues.parent")}
			</span>
			{parent ? (
				<div className="flex items-center gap-1">
					<Link
						to="/orgs/$orgId/projects/$projectId/$issueNumber"
						params={{
							orgId,
							projectId,
							issueNumber: String(parent.number),
						}}
						className="hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
					>
						<span className="font-mono text-xs">
							{projectKey}-{parent.number}
						</span>
						<span className="truncate">{parent.title}</span>
					</Link>
					<Button
						variant="ghost"
						size="icon-xs"
						disabled={frozen}
						aria-label={t("issues.parentClear")}
						onClick={() => onChange(null)}
					>
						<X />
					</Button>
				</div>
			) : (
				<Button
					variant="outline"
					className="w-full justify-start"
					disabled={frozen || !canSetParent}
					onClick={() => setOpen(true)}
				>
					<Plus className="size-4" />
					{t("issues.parentSet")}
				</Button>
			)}
			{!canSetParent && !parent ? (
				<p className="text-muted-foreground text-xs">
					{t("issues.parentSetDisabled")}
				</p>
			) : null}

			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next) {
						close();
					} else {
						setOpen(true);
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{t("issues.parentSetTitle")}</DialogTitle>
						<DialogDescription>
							{t("issues.parentSetDescription")}
						</DialogDescription>
					</DialogHeader>
					<IssueSearchPicker
						searchInputId="parent-issue-search"
						searchLabel={t("issues.parentSearchLabel")}
						searchPlaceholder={t("issues.parentSearchPlaceholder")}
						hint={t("issues.parentSearchHint", {
							count: ISSUE_SEARCH_MIN_LENGTH,
						})}
						noResults={t("issues.parentNoResults")}
						term={term}
						onTermChange={setTerm}
						results={results}
						isFetching={search.isFetching}
						selectedId={selected?.id ?? null}
						onSelect={(issue) => setSelected(issue)}
						projectKey={projectKey}
					/>
					<DialogFooter>
						<Button disabled={!selected} onClick={submit}>
							{t("issues.parentSubmit")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{/* Errors from the parent update surface through the page-level MutationError. */}
			{search.isError ? <MutationError error={search.error} /> : null}
		</div>
	);
}
