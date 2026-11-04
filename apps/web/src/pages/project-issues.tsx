import type { ListIssuesDto } from "@api/dto/issue.dto";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { IssueFilterGroup, IssueQuery } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import {
	ArrowLeft,
	CalendarRange,
	Columns3,
	List,
	Megaphone,
	Plus,
	SlidersHorizontal,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useTranslation } from "react-i18next";
import { NotFoundState } from "@/components/not-found-state";
import { useSession } from "@/features/auth/data";
import { CurrentCycleCard } from "@/features/cycles/components/current-cycle-card";
import { CycleFilterBadge } from "@/features/cycles/components/cycle-filter-badge";
import { cyclesQuery } from "@/features/cycles/data";
import { BoardView } from "@/features/issues/components/board-view";
import { BulkActionBar } from "@/features/issues/components/bulk-bar";
import { CreateIssueDialog } from "@/features/issues/components/create-issue-dialog";
import { IssueFilterControls } from "@/features/issues/components/issue-filter-controls";
import { IssueList } from "@/features/issues/components/issue-list";
import { IssueListToolbar } from "@/features/issues/components/list-toolbar";
import { projectIssuesQuery } from "@/features/issues/data";
import {
	type IssueListDensity,
	useIssueListPreferences,
} from "@/features/issues/list-preferences";
import {
	detachedFilterSearch,
	filterConditionCount,
	primarySortField,
	resolveIssueQuery,
} from "@/features/issues/query";
import type { IssuesSearch } from "@/features/issues/search";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery } from "@/features/members/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { ProjectUpdatesSheet } from "@/features/project-updates/components/project-updates-sheet";
import { ProjectMeta } from "@/features/projects/components/project-meta";
import { projectQuery, projectsQuery } from "@/features/projects/data";
import { useRecordRecentProject } from "@/features/search/data";
import { defaultStatusOf, statusesQuery } from "@/features/statuses/data";
import { ViewSwitcher } from "@/features/views/components/view-switcher";
import { type ViewDto, viewsQuery } from "@/features/views/data";
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
	const projects = useQuery(projectsQuery(orgId));
	const statuses = useQuery(statusesQuery(orgId));
	const cycles = useQuery(cyclesQuery(orgId, projectId));
	const frozen = useOrgFrozen(orgId);
	const [createOpen, setCreateOpen] = useState(false);
	const [updatesOpen, setUpdatesOpen] = useState(false);
	const [createStatusId, setCreateStatusId] = useState<string | undefined>(
		undefined,
	);
	const [searchInput, setSearchInput] = useState(search.search ?? "");
	const [selected, setSelected] = useState<Set<string>>(new Set());

	useEffect(() => {
		setSearchInput(search.search ?? "");
	}, [search.search]);

	const view = search.view ?? "list";

	const views = useQuery(viewsQuery(orgId, projectId));
	const currentView = search.viewId
		? views.data?.find((entry) => entry.id === search.viewId)
		: undefined;
	const resolved = resolveIssueQuery(search, {
		view: currentView?.query,
		statuses: statuses.data,
	});
	const effectiveFilter = resolved.filter;
	const sortField = primarySortField(resolved.sorts);
	const { canManage } = useOrgRole(orgId);
	const { data: session } = useSession();
	useRecordRecentProject(
		orgId,
		session?.user.id,
		project.data
			? {
					projectId: project.data.id,
					name: project.data.name,
					key: project.data.key,
				}
			: null,
	);
	const [dirtyView, setDirtyView] = useState<ViewDto | null>(null);

	useEffect(() => {
		if (search.viewId) {
			setDirtyView(null);
		}
	}, [search.viewId]);

	// A view id that no longer resolves to a visible view is a ghost filter:
	// drop it once the list has settled so URL state matches what is applied.
	useEffect(() => {
		if (
			!search.viewId ||
			!views.isSuccess ||
			views.isFetching ||
			views.data.some((entry) => entry.id === search.viewId)
		) {
			return;
		}
		setSearch({ viewId: undefined });
	}, [search.viewId, views.data, views.isSuccess, views.isFetching, setSearch]);

	const issues = useQuery(
		projectIssuesQuery(orgId, projectId, {
			filter: effectiveFilter,
			sorts: resolved.sorts,
			groupBy: resolved.groupBy,
			search: resolved.search,
			cycleId: resolved.cycleId,
			page: search.page,
		}),
	);

	const listFilters = {
		filter: effectiveFilter,
		sorts: resolved.sorts,
		groupBy: resolved.groupBy,
		search: resolved.search,
		cycleId: resolved.cycleId,
		page: search.page,
	};

	const {
		columns,
		density: storedDensity,
		toggleColumn,
		setDensity: persistDensity,
	} = useIssueListPreferences(session?.user.id);
	// Display-only: the URL wins when present, otherwise the last persisted value.
	const density: IssueListDensity = search.density ?? storedDensity;
	const setDensity = (next: IssueListDensity) => {
		persistDensity(next);
		setSearch({ density: next });
	};

	const result: ListIssuesDto | undefined = issues.data;
	const filterCount = filterConditionCount(effectiveFilter);
	const cycleFilterId = resolved.cycleId;
	const cycleFilterCycle = cycleFilterId
		? cycles.data?.items.find((cycle) => cycle.id === cycleFilterId)
		: undefined;
	const hasFilters =
		filterCount > 0 || resolved.search !== "" || Boolean(cycleFilterId);
	const activeFilterCount =
		filterCount + (resolved.search !== "" ? 1 : 0) + (cycleFilterId ? 1 : 0);

	/**
	 * Leaves the applied view (when there is one) while keeping its resolved
	 * sort/grouping, so changing the filter does not silently reset either.
	 */
	const detachView = (
		nextFilter: IssueFilterGroup | undefined,
		options: {
			search?: string;
			overrides?: Partial<Pick<IssuesSearch, "sort" | "groupBy" | "page">>;
		} = {},
	) => {
		setSelected(new Set());
		if (currentView) {
			setDirtyView(currentView);
		}
		setSearch(
			detachedFilterSearch({
				view: currentView?.query,
				resolved,
				filter: nextFilter,
				search: options.search,
				overrides: options.overrides,
			}),
		);
	};

	const updateSearch = (next: Partial<IssuesSearch>) => {
		setSelected(new Set());
		if (currentView && ("sort" in next || "groupBy" in next)) {
			const overrides: Partial<
				Pick<IssuesSearch, "sort" | "groupBy" | "page">
			> = {};
			if ("sort" in next) {
				overrides.sort = next.sort;
			}
			if ("groupBy" in next) {
				overrides.groupBy = next.groupBy;
			}
			if (next.page !== undefined) {
				overrides.page = next.page;
			}
			detachView(effectiveFilter, { overrides });
			return;
		}
		setSearch(next);
	};

	const setGroupBy = (next: IssuesSearch["groupBy"]) => {
		updateSearch({ groupBy: next });
	};

	/**
	 * Quick filters and the structured builder both replace field conditions in
	 * the applied filter. Editing detaches from the saved view while keeping the
	 * base view around for "update" / "save as".
	 */
	const applyFilter = (next: IssueFilterGroup | undefined) => {
		detachView(next);
	};

	const applyView = (next: ViewDto) => {
		setDirtyView(null);
		setSelected(new Set());
		setSearch({
			viewId: next.id,
			filter: "",
			sort: "updated",
			groupBy: undefined,
			statusId: "",
			status: "",
			priority: "",
			assigneeId: "",
			labelId: "",
			cycleId: "",
			page: 1,
			view: next.layout === "board" ? "board" : "list",
		});
	};

	const clearView = () => {
		setDirtyView(null);
		setSelected(new Set());
		setSearch({
			viewId: undefined,
			filter: "",
			sort: "updated",
			groupBy: undefined,
			statusId: "",
			status: "",
			priority: "",
			assigneeId: "",
			labelId: "",
			cycleId: "",
			page: 1,
		});
	};

	// Clearing filters keeps the user's sort/grouping (and a view's resolved
	// ones) intact; it is not the same as resetting to defaults. The flat cycle
	// filter is cleared here too, in the same navigation.
	const clearFilters = () => {
		setSelected(new Set());
		if (currentView) {
			setDirtyView(currentView);
		}
		setSearch({
			...detachedFilterSearch({
				view: currentView?.query,
				resolved,
				filter: undefined,
				search: "",
			}),
			cycleId: "",
		});
	};

	const savedQuery: IssueQuery = {
		filter: effectiveFilter,
		sort: resolved.sorts,
		groupBy: resolved.groupBy ?? null,
		layout: view === "board" ? "board" : "list",
	};
	// The empty state owns the only "create" call to action on a fresh project.
	const hideHeaderCreate =
		view === "list" &&
		!hasFilters &&
		!issues.isPending &&
		!issues.isError &&
		result?.items.length === 0;

	const onSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setSelected(new Set());
		setSearch({ search: searchInput.trim(), page: 1 });
	};

	const gotoPage = (next: number) => updateSearch({ page: next });

	const openCreate = (statusId?: string) => {
		setCreateStatusId(statusId ?? defaultStatusOf(statuses.data)?.id);
		setCreateOpen(true);
	};

	// The command palette can deep-link here with the `new` flag set.
	useEffect(() => {
		if (!search.new) {
			return;
		}
		setCreateStatusId(defaultStatusOf(statuses.data)?.id);
		setCreateOpen(true);
	}, [search.new, statuses.data]);

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

	const selectedIssues = (result?.items ?? [])
		.filter((issue) => selected.has(issue.id))
		.map((issue) => ({ number: issue.number, labelIds: issue.labelIds }));

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
						{project.data && (
							<ProjectMeta
								className="mt-2"
								project={project.data}
								members={members.data ?? []}
							/>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setUpdatesOpen(true)}
						>
							<Megaphone className="size-4" />
							{t("projectUpdates.title")}
						</Button>
						<Link
							to="/orgs/$orgId/projects/$projectId/cycles"
							params={{ orgId, projectId }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<CalendarRange className="size-4" />
							{t("cycles.title")}
						</Link>
						{view === "list" && (
							<IssueListToolbar
								groupBy={resolved.groupBy}
								onGroupByChange={setGroupBy}
								density={density}
								onDensityChange={setDensity}
								columns={columns}
								onToggleColumn={toggleColumn}
							/>
						)}
						<ViewSwitcher
							orgId={orgId}
							projectId={projectId}
							views={views.data ?? []}
							viewsLoading={views.isPending}
							viewsError={views.isError ? views.error : null}
							onRetryViews={() => {
								void views.refetch();
							}}
							currentView={currentView}
							dirtyView={dirtyView}
							query={savedQuery}
							layout={view === "board" ? "board" : "list"}
							canManage={canManage}
							currentUserId={session?.user.id}
							onApply={applyView}
							onUpdated={applyView}
							onCleared={clearView}
						/>
						<ToggleGroup
							value={[view]}
							onValueChange={(next) => {
								if (next[0]) {
									updateSearch({
										view: next[0] === "board" ? "board" : "list",
									});
								}
							}}
							spacing={0}
							variant="outline"
						>
							<ToggleGroupItem value="list" size="sm">
								<List />
								{t("issues.viewList")}
							</ToggleGroupItem>
							<ToggleGroupItem value="board" size="sm">
								<Columns3 />
								{t("issues.viewBoard")}
							</ToggleGroupItem>
						</ToggleGroup>
						{!hideHeaderCreate && (
							<Button onClick={() => openCreate()} disabled={frozen} title="C">
								<Plus />
								{t("issues.newIssue")}
							</Button>
						)}
					</div>
				</div>
			</header>

			<div className="border-b px-4 py-3 empty:hidden lg:px-6">
				<CurrentCycleCard orgId={orgId} projectId={projectId} />
			</div>

			{isDesktop ? (
				<div className="border-b flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
					{cycleFilterCycle && (
						<CycleFilterBadge
							name={cycleFilterCycle.name}
							onClear={() => setSearch({ cycleId: "", page: 1 })}
						/>
					)}
					<IssueFilterControls
						variant="inline"
						filter={effectiveFilter}
						statuses={statuses.data ?? []}
						members={members.data ?? []}
						labels={labels.data ?? []}
						projects={projects.data ?? []}
						cycles={cycles.data?.items ?? []}
						showSort={view === "list"}
						sort={sortField}
						searchInput={searchInput}
						searchInputRef={searchInputRef}
						hasFilters={hasFilters}
						onSearchInput={setSearchInput}
						onSearchSubmit={onSearch}
						onUpdateSearch={updateSearch}
						onFilterChange={applyFilter}
						onClearFilters={clearFilters}
					/>
				</div>
			) : (
				<div className="border-b flex items-center gap-2 px-4 py-3 lg:px-6">
					{cycleFilterCycle && (
						<CycleFilterBadge
							name={cycleFilterCycle.name}
							onClear={() => setSearch({ cycleId: "", page: 1 })}
						/>
					)}
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
									filter={effectiveFilter}
									statuses={statuses.data ?? []}
									members={members.data ?? []}
									labels={labels.data ?? []}
									projects={projects.data ?? []}
									cycles={cycles.data?.items ?? []}
									showSort={view === "list"}
									sort={sortField}
									searchInput={searchInput}
									searchInputRef={searchInputRef}
									hasFilters={hasFilters}
									onSearchInput={setSearchInput}
									onSearchSubmit={onSearch}
									onUpdateSearch={updateSearch}
									onFilterChange={applyFilter}
									onClearFilters={clearFilters}
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
							filter: effectiveFilter,
							sorts: resolved.sorts,
							groupBy: resolved.groupBy,
							search: resolved.search,
							cycleId: resolved.cycleId,
						}}
						members={members.data ?? []}
						labels={labels.data ?? []}
						statuses={statuses.data ?? []}
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
					statuses={statuses.data ?? []}
					page={search.page}
					selected={selected}
					frozen={frozen}
					hasFilters={hasFilters}
					filters={listFilters}
					columns={columns}
					density={density}
					groupBy={resolved.groupBy}
					toggleAllOnPage={toggleAllOnPage}
					toggleOne={toggleOne}
					onPageChange={gotoPage}
					onClearFilters={clearFilters}
					onNewIssue={() => openCreate()}
				/>
			)}

			{selectedIssues.length > 0 && view === "list" && (
				<BulkActionBar
					orgId={orgId}
					projectId={projectId}
					issues={selectedIssues}
					statuses={statuses.data ?? []}
					members={members.data ?? []}
					labels={labels.data ?? []}
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
				defaultStatusId={createStatusId}
				defaultCycleId={resolved.cycleId}
				members={members.data ?? []}
				labels={labels.data ?? []}
				statuses={statuses.data ?? []}
				cycles={cycles.data?.items ?? []}
			/>

			<ProjectUpdatesSheet
				orgId={orgId}
				projectId={projectId}
				open={updatesOpen}
				onOpenChange={setUpdatesOpen}
				frozen={frozen}
			/>
		</div>
	);
}
