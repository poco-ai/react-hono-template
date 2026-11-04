import type { IssueRelationsDto } from "@api/dto/relation.dto";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ISSUE_RELATION_INPUT_TYPES,
	type IssueRelationInputType,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@workspace/ui/components/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Link2, ListTree, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { MutationError } from "@/components/mutation-error";
import { PriorityBadge } from "@/features/issues/components/priority-badge";
import { StatusBadge } from "@/features/issues/components/status-badge";
import {
	ISSUE_PICKER_PAGE_SIZE,
	ISSUE_SEARCH_MIN_LENGTH,
	issueRelationsQuery,
	issueSearchQuery,
	useCreateIssueRelation,
	useDeleteIssueRelation,
} from "@/features/issues/data";

type RelationLink = IssueRelationsDto["blocks"][number];

const GROUP_KEYS = ["blocks", "blockedBy", "related", "duplicates"] as const;

export function RelationsSection({
	orgId,
	projectId,
	projectKey,
	issueId,
	issueNumber,
	frozen,
}: {
	orgId: string;
	projectId: string;
	projectKey: string;
	issueId: string;
	issueNumber: number;
	frozen: boolean;
}) {
	const { t } = useTranslation();
	const relations = useQuery(
		issueRelationsQuery(orgId, projectId, issueNumber),
	);
	const createMutation = useCreateIssueRelation(orgId, projectId, issueNumber);
	const deleteMutation = useDeleteIssueRelation(orgId, projectId, issueNumber);

	const [addOpen, setAddOpen] = useState(false);
	const [type, setType] = useState<IssueRelationInputType>("blocks");
	const [term, setTerm] = useState("");
	const [selected, setSelected] = useState<{
		id: string;
		number: number;
		title: string;
		priority: number;
		status: RelationLink["issue"]["status"];
	} | null>(null);
	const [removeTarget, setRemoveTarget] = useState<RelationLink | null>(null);

	const search = useQuery(
		issueSearchQuery(orgId, term, {
			projectId,
			pageSize: ISSUE_PICKER_PAGE_SIZE,
		}),
	);
	// The API already scopes results to the project; only hide the current issue.
	const results = (search.data?.items ?? []).filter(
		(issue) => issue.id !== issueId,
	);

	const groups: Record<(typeof GROUP_KEYS)[number], RelationLink[]> = {
		blocks: relations.data?.blocks ?? [],
		blockedBy: relations.data?.blockedBy ?? [],
		related: relations.data?.related ?? [],
		duplicates: relations.data?.duplicates ?? [],
	};
	const total = GROUP_KEYS.reduce((sum, key) => sum + groups[key].length, 0);

	const resetAdd = () => {
		setTerm("");
		setSelected(null);
		setType("blocks");
		createMutation.reset();
	};

	const openAdd = () => {
		resetAdd();
		setAddOpen(true);
	};

	const submit = () => {
		if (!selected) {
			return;
		}
		createMutation.mutate(
			{ relatedIssueId: selected.id, type },
			{
				onSuccess: () => {
					toast.success(t("toast.relationAdded"));
					setAddOpen(false);
					resetAdd();
				},
			},
		);
	};

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="font-heading text-base font-medium">
						{t("issues.relations.title")}
					</h2>
					<p className="text-muted-foreground text-sm">
						{t("issues.relations.description")}
					</p>
				</div>
				<Button variant="outline" size="sm" disabled={frozen} onClick={openAdd}>
					<Plus className="size-4" />
					{t("issues.relations.add")}
				</Button>
			</div>

			{relations.isPending ? (
				<div className="flex flex-col gap-2" aria-busy="true">
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</div>
			) : relations.isError ? (
				<MutationError error={relations.error} />
			) : total === 0 ? (
				<EmptyState
					icon={ListTree}
					title={t("issues.relations.empty")}
					description={t("issues.relations.description")}
				/>
			) : (
				GROUP_KEYS.map((key) =>
					groups[key].length === 0 ? null : (
						<div key={key} className="flex flex-col gap-2">
							<h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
								{t(`issues.relations.groups.${key}`)}
							</h3>
							<ItemGroup>
								{groups[key].map((link) => (
									<Item key={link.id} variant="outline">
										<ItemContent className="min-w-0">
											<ItemTitle className="min-w-0">
												<Link
													to="/orgs/$orgId/projects/$projectId/$issueNumber"
													params={{
														orgId,
														projectId,
														issueNumber: String(link.issue.number),
													}}
													className="inline-flex min-w-0 items-center gap-2 hover:underline"
												>
													<span className="font-mono text-xs">
														{projectKey}-{link.issue.number}
													</span>
													<span className="truncate">{link.issue.title}</span>
												</Link>
											</ItemTitle>
											<ItemDescription className="flex flex-wrap items-center gap-1.5">
												<StatusBadge status={link.issue.status} />
												<PriorityBadge value={link.issue.priority} />
											</ItemDescription>
										</ItemContent>
										<ItemActions>
											<Button
												variant="ghost"
												size="icon-xs"
												disabled={frozen}
												aria-label={t("issues.relations.remove")}
												onClick={() => setRemoveTarget(link)}
											>
												<X />
											</Button>
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						</div>
					),
				)
			)}

			{deleteMutation.isError && <MutationError error={deleteMutation.error} />}

			<Dialog
				open={addOpen}
				onOpenChange={(open) => {
					setAddOpen(open);
					if (!open) {
						resetAdd();
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{t("issues.relations.addTitle")}</DialogTitle>
						<DialogDescription>
							{t("issues.relations.addDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<Field>
							<FieldLabel>{t("issues.relations.typeLabel")}</FieldLabel>
							<Select
								value={type}
								onValueChange={(value) =>
									value && setType(value as IssueRelationInputType)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{t(`issues.relations.types.${type}`)}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{ISSUE_RELATION_INPUT_TYPES.map((option) => (
										<SelectItem key={option} value={option}>
											{t(`issues.relations.types.${option}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="relation-issue-search">
								{t("issues.relations.searchLabel")}
							</FieldLabel>
							<Command
								shouldFilter={false}
								className="rounded-lg border bg-transparent"
							>
								<CommandInput
									id="relation-issue-search"
									value={term}
									onValueChange={setTerm}
									placeholder={t("issues.relations.searchPlaceholder")}
								/>
								<CommandList>
									{term.trim().length < ISSUE_SEARCH_MIN_LENGTH ? (
										<div className="text-muted-foreground py-6 text-center text-sm">
											{t("issues.relations.searchHint", {
												count: ISSUE_SEARCH_MIN_LENGTH,
											})}
										</div>
									) : (
										<>
											<CommandEmpty>
												{search.isFetching
													? t("common.loading")
													: t("issues.relations.noResults")}
											</CommandEmpty>
											<CommandGroup>
												{results.map((issue) => (
													<CommandItem
														key={issue.id}
														value={issue.id}
														data-checked={selected?.id === issue.id}
														onSelect={() =>
															setSelected({
																id: issue.id,
																number: issue.number,
																title: issue.title,
																priority: issue.priority,
																status: issue.status,
															})
														}
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
												))}
											</CommandGroup>
										</>
									)}
								</CommandList>
							</Command>
						</Field>
						{selected ? (
							<p className="text-muted-foreground flex items-center gap-2 text-sm">
								<Link2 className="size-4" />
								<span className="font-mono text-xs">
									{projectKey}-{selected.number}
								</span>
								<span className="truncate">{selected.title}</span>
							</p>
						) : null}
						{createMutation.isError && (
							<MutationError error={createMutation.error} />
						)}
					</div>
					<DialogFooter>
						<Button
							disabled={!selected || createMutation.isPending}
							onClick={submit}
						>
							{t("issues.relations.submit")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={removeTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRemoveTarget(null);
					}
				}}
				title={t("issues.relations.removeTitle")}
				description={
					removeTarget
						? t("issues.relations.removeDescription", {
								issue: `${projectKey}-${issueNumber}`,
								related: `${projectKey}-${removeTarget.issue.number}`,
							})
						: undefined
				}
				confirmLabel={t("issues.relations.remove")}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					if (!removeTarget) {
						return;
					}
					deleteMutation.mutate(removeTarget.id, {
						onSuccess: () => {
							toast.success(t("toast.relationRemoved"));
							setRemoveTarget(null);
						},
					});
				}}
			/>
		</section>
	);
}
