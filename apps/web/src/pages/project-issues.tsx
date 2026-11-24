import type { ListIssuesDto } from "@api/features/issues/dto/issue.dto";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { IssueFilterGroup, IssueQuery } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Toggle } from "@workspace/ui/components/toggle";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import {
	Archive,
	ArrowLeft,
	CalendarRange,
	Clock3,
	Columns3,
	Download,
	List,
	ListChecks,
	Megaphone,
	MoreHorizontal,
	Plus,
	SlidersHorizontal,
	Star,
	Upload,
} from "lucide-react";
import {
	type ComponentProps,
	type FormEvent,
	useEffect,
	useRef,
	useState,
} from "react";

import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { NotFoundState } from "@/components/not-found-state";
import { useSession } from "@/features/auth/data";
import { CurrentCycleCard } from "@/features/cycles/components/current-cycle-card";
import { CycleFilterBadge } from "@/features/cycles/components/cycle-filter-badge";
import { cyclesQuery } from "@/features/cycles/data";
import {
	favoritesQuery,
	isFavorited,
	useToggleFavorite,
} from "@/features/favorites/data";
import { BoardView } from "@/features/issues/components/board-view";
import { BulkActionBar } from "@/features/issues/components/bulk-bar";
import { CreateIssueDialog } from "@/features/issues/components/create-issue-dialog";
import {
	exportProjectIssuesCsv,
	ImportExportMenu,
} from "@/features/issues/components/import-export-menu";
import { IssueFilterControls } from "@/features/issues/components/issue-filter-controls";
import { IssueList } from "@/features/issues/components/issue-list";
import { IssueListToolbar } from "@/features/issues/components/list-toolbar";
import { projectIssuesQuery } from "@/features/issues/data";
import {
	type IssueListDensity,
	useIssueListPreferences,
} from "@/features/issues/list-preferences";
import {
	filterConditionCount,
	primarySortField,
	resolveIssueQuery,
} from "@/features/issues/query";
import type { IssuesSearch } from "@/features/issues/search";
import { useViewDetach } from "@/features/issues/use-view-detach";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery } from "@/features/members/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { ProjectUpdatesSheet } from "@/features/project-updates/components/project-updates-sheet";
import { ProjectMeta } from "@/features/projects/components/project-meta";
import { projectQuery, projectsQuery } from "@/features/projects/data";
import { RecurrencesSheet } from "@/features/recurrences/components/recurrences-sheet";
import { useRecordRecentProject } from "@/features/search/data";
import { defaultStatusOf, statusesQuery } from "@/features/statuses/data";
import { ViewSwitcher } from "@/features/views/components/view-switcher";
import { type ViewDto, viewsQuery } from "@/features/views/data";
import { apiErrorMessage, isNotFoundError } from "@/lib/errors";
import { APP_HOTKEYS, isHotkeyBlocked } from "@/lib/hotkeys";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useDocumentTitle } from "@/lib/use-document-title";
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
	const [recurrencesOpen, setRecurrencesOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [selectionMode, setSelectionMode] = useState(false);
	const [createStatusId, setCreateStatusId] = useState<string | undefined>(
		undefined,
	);
	const [searchInput, setSearchInput] = useState(search.search ?? "");

	useEffect(() => {
		setSearchInput(search.search ?? "");
	}, [search.search]);

	const view = search.view ?? "list";
	const includeArchived = search.includeArchived ?? false;

	const favorites = useQuery(favoritesQuery(orgId));
	const favoriteMutation = useToggleFavorite(orgId, {
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});
	const projectFavorited = project.data
		? isFavorited(favorites.data, "project", project.data.id)
		: false;
	const projectArchived = Boolean(project.data?.archived);
	const projectFavoriteLabel = projectArchived
		? t("favorites.archivedProject")
		: t(projectFavorited ? "favorites.removeProject" : "favorites.addProject");
	const toggleProjectFavorite = () => {
		if (!project.data) {
			return;
		}
		favoriteMutation.mutate({
			entityType: "project",
			entityId: project.data.id,
			favorited: projectFavorited,
		});
	};

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

	const issueFilters = {
		filter: effectiveFilter,
		sorts: resolved.sorts,
		groupBy: resolved.groupBy,
		search: resolved.search,
		cycleId: resolved.cycleId,
		includeArchived,
	};
	const listFilters = { ...issueFilters, page: search.page };
	const issues = useQuery(projectIssuesQuery(orgId, projectId, listFilters));

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

	// Page selection survives paging; filter/view changes clear it explicitly
	// through `clear` (see `useViewDetach`).
	const { selected, toggleOne, toggleAll, clear } = useBulkSelection({
		ids: result?.items.map((issue) => issue.id) ?? [],
	});

	const { dirtyView, clearDirtyView, detachView, updateSearch } = useViewDetach(
		{
			viewId: search.viewId,
			currentView,
			resolved,
			views: {
				data: views.data,
				isSuccess: views.isSuccess,
				isFetching: views.isFetching,
			},
			setSearch,
			onSelectionReset: clear,
		},
	);

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
		clearDirtyView();
		clear();
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
		clearDirtyView();
		clear();
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
		detachView(undefined, { search: "", extra: { cycleId: "" } });
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
		clear();
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

	// Mobile card-list selection mode; entering or leaving it drops the
	// selection so stale checks never leak into the bulk bar.
	const toggleSelectionMode = () => {
		setSelectionMode((previous) => !previous);
		clear();
	};

	const searchInputRef = useRef<HTMLInputElement>(null);
	const isDesktop = useMediaQuery("(min-width: 768px)");
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

	useHotkeys([
		{
			hotkey: APP_HOTKEYS.newIssue.hotkey,
			callback: () => {
				if (isHotkeyBlocked() || frozen) return;
				openCreate();
			},
		},
		{
			hotkey: APP_HOTKEYS.focusIssueSearch.hotkey,
			callback: () => {
				if (isHotkeyBlocked()) return;
				if (searchInputRef.current) {
					searchInputRef.current.focus();
				} else {
					focusSearchOnOpenRef.current = true;
					setFilterOpen(true);
				}
			},
		},
	]);

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

	const archivedToggle = (
		<Toggle
			variant="outline"
			size="sm"
			className="max-md:h-9"
			pressed={includeArchived}
			aria-label={t("issues.showArchived")}
			title={t("issues.showArchived")}
			onPressedChange={(pressed) =>
				updateSearch({ includeArchived: pressed || undefined, page: 1 })
			}
		>
			<Archive />
			<span className="max-sm:hidden">{t("issues.showArchived")}</span>
		</Toggle>
	);

	const filterControlsProps: Omit<
		ComponentProps<typeof IssueFilterControls>,
		"variant"
	> = {
		filter: effectiveFilter,
		statuses: statuses.data ?? [],
		members: members.data ?? [],
		labels: labels.data ?? [],
		projects: projects.data ?? [],
		cycles: cycles.data?.items ?? [],
		showSort: view === "list",
		sort: sortField,
		searchInput,
		searchInputRef,
		hasFilters,
		onSearchInput: setSearchInput,
		onSearchSubmit: onSearch,
		onUpdateSearch: updateSearch,
		onFilterChange: applyFilter,
		onClearFilters: clearFilters,
	};

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
					<div className="flex max-md:flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="icon-sm"
							className="hidden md:inline-flex"
							aria-label={projectFavoriteLabel}
							aria-pressed={projectFavorited}
							title={projectFavoriteLabel}
							disabled={
								!project.data || projectArchived || favoriteMutation.isPending
							}
							onClick={toggleProjectFavorite}
						>
							<Star className={projectFavorited ? "fill-current" : undefined} />
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="hidden md:inline-flex"
							onClick={() => setUpdatesOpen(true)}
						>
							<Megaphone className="size-4" />
							{t("projectUpdates.title")}
						</Button>
						<Link
							to="/orgs/$orgId/projects/$projectId/cycles"
							params={{ orgId, projectId }}
							className={buttonVariants({
								variant: "outline",
								size: "sm",
								className: "hidden md:inline-flex",
							})}
						>
							<CalendarRange className="size-4" />
							{t("cycles.title")}
						</Link>
						<Button
							variant="outline"
							size="sm"
							className="hidden md:inline-flex"
							onClick={() => setRecurrencesOpen(true)}
						>
							<Clock3 className="size-4" />
							{t("recurrences.title")}
						</Button>
						{view === "list" && (
							<div className="hidden md:block">
								<IssueListToolbar
									groupBy={resolved.groupBy}
									onGroupByChange={setGroupBy}
									density={density}
									onDensityChange={setDensity}
									columns={columns}
									onToggleColumn={toggleColumn}
								/>
							</div>
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
								<span className="hidden md:inline">{t("issues.viewList")}</span>
							</ToggleGroupItem>
							<ToggleGroupItem value="board" size="sm">
								<Columns3 />
								<span className="hidden md:inline">
									{t("issues.viewBoard")}
								</span>
							</ToggleGroupItem>
						</ToggleGroup>
						<ImportExportMenu
							orgId={orgId}
							projectId={projectId}
							frozen={frozen}
							open={importOpen}
							onOpenChange={setImportOpen}
							triggerClassName="hidden md:inline-flex"
						/>
						{/* Mobile-only overflow menu for the controls that no longer
						    fit the action row below md. */}
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="outline"
										size="icon-sm"
										className="max-md:size-9 md:hidden"
										aria-label={t("common.moreActions")}
										title={t("common.moreActions")}
									>
										<MoreHorizontal />
									</Button>
								}
							/>
							<DropdownMenuContent align="end" className="w-52">
								<DropdownMenuItem
									disabled={
										!project.data ||
										projectArchived ||
										favoriteMutation.isPending
									}
									onClick={toggleProjectFavorite}
								>
									<Star
										className={projectFavorited ? "fill-current" : undefined}
									/>
									{projectFavoriteLabel}
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setUpdatesOpen(true)}>
									<Megaphone className="size-4" />
									{t("projectUpdates.title")}
								</DropdownMenuItem>
								<DropdownMenuItem
									render={
										<Link
											to="/orgs/$orgId/projects/$projectId/cycles"
											params={{ orgId, projectId }}
										/>
									}
								>
									<CalendarRange className="size-4" />
									{t("cycles.title")}
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setRecurrencesOpen(true)}>
									<Clock3 className="size-4" />
									{t("recurrences.title")}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									disabled={frozen}
									onClick={() => setImportOpen(true)}
								>
									<Upload className="size-4" />
									{t("issues.csv.import")}
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() =>
										void exportProjectIssuesCsv(orgId, projectId, t)
									}
								>
									<Download className="size-4" />
									{t("issues.csv.export")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
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
					<IssueFilterControls {...filterControlsProps} variant="inline" />
					{archivedToggle}
				</div>
			) : (
				<div className="border-b flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
					{cycleFilterCycle && (
						<CycleFilterBadge
							name={cycleFilterCycle.name}
							onClear={() => setSearch({ cycleId: "", page: 1 })}
						/>
					)}
					{view === "list" && (
						<Toggle
							variant="outline"
							size="sm"
							className="h-9"
							pressed={selectionMode}
							aria-label={t("issues.selectMode")}
							title={t("issues.selectMode")}
							onPressedChange={toggleSelectionMode}
						>
							<ListChecks />
							{t("issues.selectMode")}
						</Toggle>
					)}
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5 h-9"
						onClick={() => setFilterOpen(true)}
					>
						<SlidersHorizontal className="size-4" />
						{activeFilterCount > 0
							? `${t("issues.filterButton")} (${t("issues.filterActive", {
									count: activeFilterCount,
								})})`
							: t("issues.filterButton")}
					</Button>
					{archivedToggle}
					<Sheet open={filterOpen} onOpenChange={setFilterOpen}>
						<SheetContent
							side="bottom"
							className="max-h-[85svh] gap-0 pb-[env(safe-area-inset-bottom)]"
						>
							<SheetHeader className="border-b">
								<SheetTitle>{t("issues.filterButton")}</SheetTitle>
							</SheetHeader>
							<div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
								<IssueFilterControls {...filterControlsProps} variant="sheet" />
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
						filters={issueFilters}
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
					selectionMode={selectionMode}
					frozen={frozen}
					hasFilters={hasFilters}
					filters={listFilters}
					columns={columns}
					density={density}
					groupBy={resolved.groupBy}
					toggleAllOnPage={toggleAll}
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
					onDone={() => clear()}
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
			<RecurrencesSheet
				orgId={orgId}
				projectId={projectId}
				open={recurrencesOpen}
				onOpenChange={setRecurrencesOpen}
				frozen={frozen}
			/>
		</div>
	);
}
