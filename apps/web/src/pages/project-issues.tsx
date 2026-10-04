import type { ListIssuesDto } from "@api/dto/issue.dto";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
	parseCsv,
} from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import {
	ArrowLeft,
	Columns3,
	List,
	Plus,
	SlidersHorizontal,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useTranslation } from "react-i18next";
import { NotFoundState } from "@/components/not-found-state";
import { BoardView } from "@/features/issues/components/board-view";
import { BulkActionBar } from "@/features/issues/components/bulk-bar";
import { CreateIssueDialog } from "@/features/issues/components/create-issue-dialog";
import { IssueFilterControls } from "@/features/issues/components/issue-filter-controls";
import { IssueList } from "@/features/issues/components/issue-list";
import { projectIssuesQuery } from "@/features/issues/data";
import type { IssuesSearch } from "@/features/issues/search";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery } from "@/features/members/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { projectQuery } from "@/features/projects/data";
import { isNotFoundError } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useHotkeys } from "@/lib/use-hotkeys";
import { useMediaQuery } from "@/lib/use-media-query";

export function ProjectIssuesPage({
	orgId,
	projectId,
	search,
	setSearch,
}: {
	orgId: string;
	projectId: string;
	search: IssuesSearch;
	setSearch: (next: Partial<IssuesSearch>) => void;
}) {
	const { t } = useTranslation();
	const project = useQuery(projectQuery(orgId, projectId));
	useDocumentTitle(project.data?.name);
	const members = useQuery(membersQuery(orgId));
	const labels = useQuery(labelsQuery(orgId));
	const frozen = useOrgFrozen(orgId);
	const [createOpen, setCreateOpen] = useState(false);
	const [createStatus, setCreateStatus] = useState<IssueStatus>("backlog");
	const [searchInput, setSearchInput] = useState(search.search ?? "");
	const [selected, setSelected] = useState<Set<string>>(new Set());

	useEffect(() => {
		setSearchInput(search.search ?? "");
	}, [search.search]);

	const updateSearch = (next: Partial<IssuesSearch>) => {
		setSelected(new Set());
		setSearch(next);
	};

	const view = search.view ?? "list";

	const statusFilter = parseCsv(search.status).filter((value) =>
		(ISSUE_STATUSES as readonly string[]).includes(value),
	) as IssueStatus[];
	const priorityFilter = parseCsv(search.priority).filter((value) =>
		ISSUE_PRIORITIES.some((priority) => priority.name === value),
	) as IssuePriorityName[];

	const issues = useQuery(
		projectIssuesQuery(orgId, projectId, {
			page: search.page,
			status: statusFilter,
			priority: priorityFilter,
			assigneeId: search.assigneeId,
			labelId: search.labelId,
			search: search.search ?? "",
			sort: search.sort,
		}),
	);

	const result: ListIssuesDto | undefined = issues.data;
	const hasFilters =
		statusFilter.length > 0 ||
		priorityFilter.length > 0 ||
		search.assigneeId !== undefined ||
		search.labelId !== undefined ||
		(search.search ?? "") !== "";
	const activeFilterCount =
		statusFilter.length +
		priorityFilter.length +
		(search.assigneeId !== undefined ? 1 : 0) +
		(search.labelId !== undefined ? 1 : 0) +
		((search.search ?? "") !== "" ? 1 : 0);
	// The empty state owns the only "create" call to action on a fresh project.
	const hideHeaderCreate =
		view === "list" &&
		!hasFilters &&
		!issues.isPending &&
		!issues.isError &&
		result?.items.length === 0;

	const memberById = new Map(
		(members.data ?? []).map((member) => [member.userId, member]),
	);
	const labelById = new Map(
		(labels.data ?? []).map((label) => [label.id, label]),
	);
	const assigneeFilterActive = Boolean(search.assigneeId);
	const assigneeFilterLabel =
		search.assigneeId === undefined || search.assigneeId === ""
			? t("common.all")
			: search.assigneeId === "none"
				? t("common.unassigned")
				: (memberById.get(search.assigneeId)?.user.name ?? t("common.all"));
	const labelFilterActive = Boolean(search.labelId);
	const labelFilterLabel = search.labelId
		? (labelById.get(search.labelId)?.name ?? t("common.all"))
		: t("common.all");

	const onSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		updateSearch({ search: searchInput.trim(), page: 1 });
	};

	const gotoPage = (next: number) => updateSearch({ page: next });

	const openCreate = (status?: IssueStatus) => {
		setCreateStatus(status ?? "backlog");
		setCreateOpen(true);
	};

	// The command palette can deep-link here with the `new` flag set.
	useEffect(() => {
		if (!search.new) {
			return;
		}
		setCreateStatus("backlog");
		setCreateOpen(true);
	}, [search.new]);

	const searchInputRef = useRef<HTMLInputElement>(null);
	const isDesktop = useMediaQuery("(min-width: 640px)");
	const [filterOpen, setFilterOpen] = useState(false);
	const focusSearchOnOpenRef = useRef(false);

	useEffect(() => {
		if (isDesktop) {
			setFilterOpen(false);
			focusSearchOnOpenRef.current = false;
		}
	}, [isDesktop]);

	useEffect(() => {
		if (!filterOpen || !focusSearchOnOpenRef.current) {
			return;
		}
		focusSearchOnOpenRef.current = false;
		const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [filterOpen]);

	useHotkeys({
		c: () => {
			if (!frozen) {
				openCreate();
			}
		},
		"/": () => {
			if (searchInputRef.current) {
				searchInputRef.current.focus();
			} else {
				focusSearchOnOpenRef.current = true;
				setFilterOpen(true);
			}
		},
	});

	const toggleAllOnPage = (checked: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			for (const issue of result?.items ?? []) {
				if (checked) {
					next.add(issue.id);
				} else {
					next.delete(issue.id);
				}
			}
			return next;
		});
	};

	const toggleOne = (id: string, checked: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	};

	const selectedNumbers = (result?.items ?? [])
		.filter((issue) => selected.has(issue.id))
		.map((issue) => issue.number);

	if (project.isError && isNotFoundError(project.error)) {
		return (
			<NotFoundState
				title={t("projects.notFoundTitle")}
				action={
					<Link
						to="/orgs/$orgId/projects"
						params={{ orgId }}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<ArrowLeft className="size-4" />
						{t("projects.backToProjects")}
					</Link>
				}
			/>
		);
	}

	return (
		<div className="flex min-h-svh flex-col">
			<header className="border-b px-4 py-6 lg:px-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="flex items-center gap-3">
							<h1 className="truncate text-2xl font-semibold tracking-tight">
								{project.data?.name ?? t("common.loading")}
							</h1>
							{project.data && (
								<Badge variant="outline" className="rounded-md font-mono">
									{project.data.key}
								</Badge>
							)}
						</div>
						{project.data?.description && (
							<p className="text-muted-foreground mt-1 line-clamp-2 max-w-2xl text-sm">
								{project.data.description}
							</p>
						)}
					</div>
					<div className="flex items-center gap-2">
						<div className="bg-muted flex rounded-lg p-0.5">
							<Button
								variant={view === "list" ? "secondary" : "ghost"}
								size="sm"
								className="gap-1.5"
								onClick={() => updateSearch({ view: "list" })}
							>
								<List className="size-4" />
								{t("issues.viewList")}
							</Button>
							<Button
								variant={view === "board" ? "secondary" : "ghost"}
								size="sm"
								className="gap-1.5"
								onClick={() => updateSearch({ view: "board" })}
							>
								<Columns3 className="size-4" />
								{t("issues.viewBoard")}
							</Button>
						</div>
						{!hideHeaderCreate && (
							<Button onClick={() => openCreate()} disabled={frozen} title="C">
								<Plus />
								{t("issues.newIssue")}
							</Button>
						)}
					</div>
				</div>
			</header>

			{isDesktop ? (
				<div className="border-b flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
					<IssueFilterControls
						variant="inline"
						statusFilter={statusFilter}
						priorityFilter={priorityFilter}
						assigneeId={search.assigneeId}
						assigneeFilterActive={assigneeFilterActive}
						assigneeFilterLabel={assigneeFilterLabel}
						labelId={search.labelId}
						labelFilterActive={labelFilterActive}
						labelFilterLabel={labelFilterLabel}
						members={members.data ?? []}
						labels={labels.data ?? []}
						showSort={view === "list"}
						sort={search.sort}
						searchInput={searchInput}
						searchInputRef={searchInputRef}
						hasFilters={hasFilters}
						onSearchInput={setSearchInput}
						onSearchSubmit={onSearch}
						onUpdateSearch={updateSearch}
					/>
				</div>
			) : (
				<div className="border-b flex items-center gap-2 px-4 py-3 lg:px-6">
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={() => setFilterOpen(true)}
					>
						<SlidersHorizontal className="size-4" />
						{activeFilterCount > 0
							? `${t("issues.filterButton")} (${t("issues.filterActive", {
									count: activeFilterCount,
								})})`
							: t("issues.filterButton")}
					</Button>
					<Sheet open={filterOpen} onOpenChange={setFilterOpen}>
						<SheetContent side="bottom" className="max-h-[85svh] gap-0">
							<SheetHeader className="border-b">
								<SheetTitle>{t("issues.filterButton")}</SheetTitle>
							</SheetHeader>
							<div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
								<IssueFilterControls
									variant="sheet"
									statusFilter={statusFilter}
									priorityFilter={priorityFilter}
									assigneeId={search.assigneeId}
									assigneeFilterActive={assigneeFilterActive}
									assigneeFilterLabel={assigneeFilterLabel}
									labelId={search.labelId}
									labelFilterActive={labelFilterActive}
									labelFilterLabel={labelFilterLabel}
									members={members.data ?? []}
									labels={labels.data ?? []}
									showSort={view === "list"}
									sort={search.sort}
									searchInput={searchInput}
									searchInputRef={searchInputRef}
									hasFilters={hasFilters}
									onSearchInput={setSearchInput}
									onSearchSubmit={onSearch}
									onUpdateSearch={updateSearch}
								/>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			)}

			{view === "board" ? (
				<div className="flex-1 overflow-x-auto px-4 py-4 lg:px-6">
					<BoardView
						orgId={orgId}
						projectId={projectId}
						projectKey={project.data?.key ?? ""}
						frozen={frozen}
						filters={{
							status: statusFilter,
							priority: priorityFilter,
							assigneeId: search.assigneeId,
							labelId: search.labelId,
							search: search.search ?? "",
							sort: search.sort,
						}}
						members={members.data ?? []}
						labels={labels.data ?? []}
						onNewIssue={openCreate}
					/>
				</div>
			) : (
				<IssueList
					orgId={orgId}
					projectId={projectId}
					projectKey={project.data?.key ?? ""}
					issues={issues}
					members={members.data ?? []}
					labels={labels.data ?? []}
					page={search.page}
					selected={selected}
					frozen={frozen}
					hasFilters={hasFilters}
					toggleAllOnPage={toggleAllOnPage}
					toggleOne={toggleOne}
					onPageChange={gotoPage}
					onClearFilters={() =>
						updateSearch({
							status: "",
							priority: "",
							assigneeId: "",
							labelId: "",
							search: "",
							page: 1,
						})
					}
					onNewIssue={() => openCreate()}
				/>
			)}

			{selectedNumbers.length > 0 && view === "list" && (
				<BulkActionBar
					orgId={orgId}
					projectId={projectId}
					numbers={selectedNumbers}
					frozen={frozen}
					onDone={() => setSelected(new Set())}
				/>
			)}

			<CreateIssueDialog
				orgId={orgId}
				projectId={projectId}
				open={createOpen}
				onOpenChange={(next) => {
					setCreateOpen(next);
					// Drop the deep-link flag so refresh/back does not reopen.
					if (!next && search.new) {
						setSearch({ new: undefined });
					}
				}}
				defaultStatus={createStatus}
				members={members.data ?? []}
				labels={labels.data ?? []}
			/>
		</div>
	);
}
