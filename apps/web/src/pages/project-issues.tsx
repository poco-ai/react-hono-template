import type { ListIssuesDto } from "@api/dto/issue.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	type CreateIssueInput,
	createIssueSchema,
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import {
	ArrowLeft,
	CircleAlert,
	Columns3,
	List,
	Plus,
	Search,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BoardView } from "@/components/issue/board-view";
import { BulkActionBar } from "@/components/issue/bulk-bar";
import { LabelBadge } from "@/components/issue/label-badge";
import { PriorityBadge } from "@/components/issue/priority-badge";
import { StatusBadge } from "@/components/issue/status-badge";
import { MarkdownContent } from "@/components/markdown";
import { MultiSelect } from "@/components/multi-select";
import { NotFoundState } from "@/components/not-found-state";
import { TablePagination } from "@/components/table-pagination";
import { UserAvatar } from "@/components/user-avatar";
import { client, unwrap } from "@/lib/api";
import { apiErrorMessage, isNotFoundError } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import {
	formatDateTime,
	formatDueDate,
	formatRelativeTime,
	fromDateInputValue,
	parseCsv,
	priorityValue,
	serializeCsv,
} from "@/lib/issue-utils";
import { projectIssuesQuery } from "@/lib/queries/issues";
import { labelsQuery } from "@/lib/queries/labels";
import { membersQuery } from "@/lib/queries/members";
import { projectQuery } from "@/lib/queries/projects";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useOrgFrozen } from "@/lib/use-org-frozen";

export interface IssuesSearch {
	page: number;
	status?: string;
	priority?: string;
	assigneeId?: string;
	labelId?: string;
	search?: string;
	sort: "updated" | "created" | "priority";
	view?: "list" | "board";
}

const PRIORITY_NAMES = ISSUE_PRIORITIES.map((p) => p.name);
const ASSIGNEE_ALL = "__all__";
const LABEL_ALL = "__all__";
const UNASSIGNED = "__unassigned__";

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
	const navigate = useNavigate();
	const queryClient = useQueryClient();
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
		(PRIORITY_NAMES as readonly string[]).includes(value),
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
	const totalPages = result
		? Math.max(1, Math.ceil(result.total / result.pageSize))
		: 1;
	const hasFilters =
		statusFilter.length > 0 ||
		priorityFilter.length > 0 ||
		search.assigneeId !== undefined ||
		search.labelId !== undefined ||
		(search.search ?? "") !== "";

	const memberById = new Map(
		(members.data ?? []).map((member) => [member.userId, member]),
	);
	const labelById = new Map(
		(labels.data ?? []).map((label) => [label.id, label]),
	);
	const assigneeFilterLabel =
		search.assigneeId === undefined || search.assigneeId === ""
			? t("common.all")
			: search.assigneeId === "none"
				? t("common.unassigned")
				: (memberById.get(search.assigneeId)?.user.name ?? t("common.all"));
	const labelFilterLabel = search.labelId
		? (labelById.get(search.labelId)?.name ?? t("issues.labels"))
		: t("issues.labels");

	const onSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		updateSearch({ search: searchInput.trim(), page: 1 });
	};

	const gotoPage = (next: number) => updateSearch({ page: next });

	const openCreate = (status?: IssueStatus) => {
		setCreateStatus(status ?? "backlog");
		setCreateOpen(true);
	};

	const allOnPageSelected =
		(result?.items.length ?? 0) > 0 &&
		result?.items.every((issue) => selected.has(issue.id));

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
								<Badge variant="outline" className="font-mono">
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
						<Button onClick={() => openCreate()} disabled={frozen}>
							<Plus />
							{t("issues.newIssue")}
						</Button>
					</div>
				</div>
			</header>

			<div className="border-b flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
				<MultiSelect
					placeholder={t("issues.filterStatus")}
					value={statusFilter}
					options={ISSUE_STATUSES.map((status) => ({
						value: status,
						label: t(`issues.statuses.${status}`),
					}))}
					onChange={(next) =>
						updateSearch({ status: serializeCsv(next), page: 1 })
					}
				/>
				<MultiSelect
					placeholder={t("issues.filterPriority")}
					value={priorityFilter}
					options={PRIORITY_NAMES.map((name) => ({
						value: name,
						label: t(`issues.priorities.${name}`),
					}))}
					onChange={(next) =>
						updateSearch({ priority: serializeCsv(next), page: 1 })
					}
				/>
				<Select
					value={search.assigneeId ?? ASSIGNEE_ALL}
					onValueChange={(value) =>
						updateSearch({
							assigneeId: value && value !== ASSIGNEE_ALL ? value : undefined,
							page: 1,
						})
					}
				>
					<SelectTrigger className="w-40">
						<SelectValue>{assigneeFilterLabel}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ASSIGNEE_ALL}>{t("common.all")}</SelectItem>
						<SelectItem value="none">{t("common.unassigned")}</SelectItem>
						{(members.data ?? []).map((member) => (
							<SelectItem key={member.userId} value={member.userId}>
								{member.user.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={search.labelId ?? LABEL_ALL}
					onValueChange={(value) =>
						updateSearch({
							labelId: value && value !== LABEL_ALL ? value : undefined,
							page: 1,
						})
					}
				>
					<SelectTrigger className="w-36">
						<SelectValue>{labelFilterLabel}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={LABEL_ALL}>{t("issues.labels")}</SelectItem>
						{(labels.data ?? []).map((label) => (
							<SelectItem key={label.id} value={label.id}>
								{label.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<form className="flex items-center gap-2" onSubmit={onSearch}>
					<div className="relative">
						<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
						<Input
							value={searchInput}
							placeholder={t("issues.searchPlaceholder")}
							onChange={(e) => setSearchInput(e.target.value)}
							className="h-8 w-56 pl-8"
						/>
					</div>
				</form>
				<Select
					value={search.sort}
					onValueChange={(value) =>
						updateSearch({ sort: value as IssuesSearch["sort"] })
					}
				>
					<SelectTrigger className="w-40">
						<SelectValue>{t(`issues.sortOptions.${search.sort}`)}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="updated">
							{t("issues.sortOptions.updated")}
						</SelectItem>
						<SelectItem value="created">
							{t("issues.sortOptions.created")}
						</SelectItem>
						<SelectItem value="priority">
							{t("issues.sortOptions.priority")}
						</SelectItem>
					</SelectContent>
				</Select>
				{hasFilters && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							updateSearch({
								status: "",
								priority: "",
								assigneeId: "",
								labelId: "",
								search: "",
								page: 1,
							})
						}
					>
						{t("issues.clearFilters")}
					</Button>
				)}
			</div>

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
				<>
					<div className="flex-1 overflow-auto px-4 py-4 lg:px-6">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10">
										<Checkbox
											aria-label={t("bulk.selectAll")}
											checked={allOnPageSelected}
											indeterminate={selected.size > 0 && !allOnPageSelected}
											disabled={frozen}
											onCheckedChange={(checked) => toggleAllOnPage(checked)}
										/>
									</TableHead>
									<TableHead className="w-24">{t("issues.number")}</TableHead>
									<TableHead>{t("issues.titleField")}</TableHead>
									<TableHead className="w-28">{t("issues.status")}</TableHead>
									<TableHead className="w-28">{t("issues.priority")}</TableHead>
									<TableHead className="w-36">{t("issues.assignee")}</TableHead>
									<TableHead className="w-48">{t("issues.labels")}</TableHead>
									<TableHead className="w-28">{t("issues.dueDate")}</TableHead>
									<TableHead className="w-44">{t("issues.updated")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{result?.items.map((issue) => {
									const assignee = issue.assigneeId
										? memberById.get(issue.assigneeId)
										: undefined;
									return (
										<TableRow
											key={issue.id}
											className={cn(
												"cursor-pointer",
												selected.has(issue.id) && "bg-accent/40",
											)}
											onClick={() =>
												navigate({
													to: "/orgs/$orgId/projects/$projectId/$issueNumber",
													params: {
														orgId,
														projectId,
														issueNumber: String(issue.number),
													},
												})
											}
										>
											<TableCell onClick={(e) => e.stopPropagation()}>
												<Checkbox
													aria-label={issue.title}
													checked={selected.has(issue.id)}
													disabled={frozen}
													onCheckedChange={(checked) =>
														toggleOne(issue.id, checked)
													}
												/>
											</TableCell>
											<TableCell className="text-muted-foreground font-mono text-xs">
												{project.data?.key}-{issue.number}
											</TableCell>
											<TableCell>
												<Link
													to="/orgs/$orgId/projects/$projectId/$issueNumber"
													params={{
														orgId,
														projectId,
														issueNumber: String(issue.number),
													}}
													className="hover:underline"
												>
													{issue.title}
												</Link>
											</TableCell>
											<TableCell>
												<StatusBadge status={issue.status as IssueStatus} />
											</TableCell>
											<TableCell>
												<PriorityBadge value={issue.priority} />
											</TableCell>
											<TableCell>
												{assignee ? (
													<span className="flex items-center gap-2 text-sm">
														<UserAvatar name={assignee.user.name} />
														<span className="truncate">
															{assignee.user.name}
														</span>
													</span>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell>
												{issue.labelIds.length > 0 ? (
													<span className="flex flex-wrap gap-1">
														{issue.labelIds.map((labelId) => {
															const label = labelById.get(labelId);
															return label ? (
																<LabelBadge key={labelId} label={label} />
															) : null;
														})}
													</span>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatDueDate(issue.dueDate) || "—"}
											</TableCell>
											<TableCell
												title={formatDateTime(issue.updatedAt)}
												className="text-muted-foreground text-xs"
											>
												{formatRelativeTime(issue.updatedAt)}
											</TableCell>
										</TableRow>
									);
								})}
								{issues.isPending && (
									<TableRow>
										<TableCell
											colSpan={9}
											className="text-muted-foreground h-16 text-center"
										>
											{t("common.loading")}
										</TableCell>
									</TableRow>
								)}
								{issues.isError && (
									<TableRow>
										<TableCell colSpan={9} className="text-center text-red-500">
											{apiErrorMessage(t, issues.error)}
										</TableCell>
									</TableRow>
								)}
								{!issues.isPending && result?.items.length === 0 && (
									<TableRow>
										<TableCell
											colSpan={9}
											className="text-muted-foreground h-16 text-center"
										>
											{hasFilters ? (
												t("issues.noResults")
											) : (
												<span className="flex items-center justify-center gap-2">
													{t("issues.empty")}
													<Button
														variant="outline"
														size="sm"
														disabled={frozen}
														onClick={() => openCreate()}
													>
														{t("issues.emptyCta")}
													</Button>
												</span>
											)}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>

					<footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm lg:px-6">
						<span>
							{result ? t("issues.count", { count: result.total }) : ""}
						</span>
						{totalPages > 1 && (
							<TablePagination
								page={search.page}
								total={result?.total}
								totalPages={totalPages}
								onPageChange={gotoPage}
								disabled={issues.isPending}
							/>
						)}
					</footer>
				</>
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
				onOpenChange={setCreateOpen}
				defaultStatus={createStatus}
				members={members.data ?? []}
				labels={labels.data ?? []}
				onCreated={() =>
					queryClient.invalidateQueries({
						queryKey: ["orgs", orgId, "projects"],
					})
				}
			/>
		</div>
	);
}

function CreateIssueDialog({
	orgId,
	projectId,
	open,
	onOpenChange,
	defaultStatus,
	members,
	labels,
	onCreated,
}: {
	orgId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultStatus: IssueStatus;
	members: { userId: string; user: { name: string } }[];
	labels: { id: string; name: string }[];
	onCreated: () => void;
}) {
	const { t } = useTranslation();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [descTab, setDescTab] = useState<"write" | "preview">("write");
	const [status, setStatus] = useState<IssueStatus>(defaultStatus);
	const [priority, setPriority] = useState<IssuePriorityName>("none");
	const [assigneeId, setAssigneeId] = useState(UNASSIGNED);
	const [labelIds, setLabelIds] = useState<string[]>([]);
	const [dueDate, setDueDate] = useState("");
	const [estimate, setEstimate] = useState("");
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const estimateNumber = estimate === "" ? undefined : Number(estimate);
	const estimateValid =
		estimateNumber === undefined ||
		(Number.isInteger(estimateNumber) &&
			estimateNumber >= 0 &&
			estimateNumber <= 100);

	useEffect(() => {
		if (open) {
			setTitle("");
			setDescription("");
			setDescTab("write");
			setStatus(defaultStatus);
			setPriority("none");
			setAssigneeId(UNASSIGNED);
			setLabelIds([]);
			setDueDate("");
			setEstimate("");
			setFieldErrors({});
		}
	}, [open, defaultStatus]);

	const createMutation = useMutation({
		mutationFn: (json: CreateIssueInput) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues.$post({
					param: { orgId, projectId },
					json,
				}),
			),
		onSuccess: () => {
			onCreated();
			onOpenChange(false);
		},
	});

	const onSubmit = () => {
		const parsedEstimate = estimate === "" ? undefined : Number(estimate);
		const parsed = createIssueSchema.safeParse({
			title: title.trim(),
			description: description.trim() || undefined,
			status,
			priority: priorityValue(priority),
			assigneeId: assigneeId === UNASSIGNED ? undefined : assigneeId,
			labelIds: labelIds.length > 0 ? labelIds : undefined,
			dueDate: fromDateInputValue(dueDate) ?? undefined,
			estimate:
				parsedEstimate !== undefined &&
				Number.isInteger(parsedEstimate) &&
				parsedEstimate >= 0
					? parsedEstimate
					: undefined,
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t);
			setFieldErrors(errors);
			focusFirstInvalidField(errors, {
				title: "issue-title",
				description: "issue-description",
			});
			return;
		}
		createMutation.mutate(parsed.data);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("issues.createTitle")}</DialogTitle>
					<DialogDescription>{t("issues.createDescription")}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="issue-title">{t("issues.titleField")}</Label>
						<Input
							id="issue-title"
							value={title}
							placeholder={t("issues.titlePlaceholder")}
							onChange={(e) => {
								setTitle(e.target.value);
								setFieldErrors((prev) => withoutFieldError(prev, "title"));
							}}
							aria-invalid={fieldErrors.title ? true : undefined}
							aria-describedby={
								fieldErrors.title ? "issue-title-error" : undefined
							}
						/>
						{fieldErrors.title && (
							<p id="issue-title-error" className="text-destructive text-sm">
								{fieldErrors.title}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="issue-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<div className="rounded-lg border">
							<div className="border-b flex items-center gap-1 px-2 pt-1.5">
								{(["write", "preview"] as const).map((value) => (
									<button
										key={value}
										type="button"
										className={cn(
											"rounded-md px-2 py-1 text-xs font-medium",
											descTab === value
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:text-foreground",
										)}
										onClick={() => setDescTab(value)}
									>
										{t(`common.${value}`)}
									</button>
								))}
							</div>
							{descTab === "write" ? (
								<Textarea
									id="issue-description"
									value={description}
									placeholder={t("issues.descriptionPlaceholder")}
									onChange={(e) => {
										setDescription(e.target.value);
										setFieldErrors((prev) =>
											withoutFieldError(prev, "description"),
										);
									}}
									className="resize-y border-0 focus-visible:ring-0"
									aria-invalid={fieldErrors.description ? true : undefined}
									aria-describedby={
										fieldErrors.description
											? "issue-description-error"
											: undefined
									}
								/>
							) : (
								<div className="min-h-24 px-3 py-2">
									{description.trim() ? (
										<MarkdownContent>{description}</MarkdownContent>
									) : (
										<p className="text-muted-foreground text-sm">
											{t("comments.previewEmpty")}
										</p>
									)}
								</div>
							)}
						</div>
						{fieldErrors.description && (
							<p
								id="issue-description-error"
								className="text-destructive text-sm"
							>
								{fieldErrors.description}
							</p>
						)}
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col gap-2">
							<Label>{t("issues.status")}</Label>
							<Select
								value={status}
								onValueChange={(v) => v && setStatus(v as IssueStatus)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>{t(`issues.statuses.${status}`)}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{ISSUE_STATUSES.map((s) => (
										<SelectItem key={s} value={s}>
											<StatusBadge status={s} />
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("issues.priority")}</Label>
							<Select
								value={priority}
								onValueChange={(v) => v && setPriority(v as IssuePriorityName)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{t(`issues.priorities.${priority}`)}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{PRIORITY_NAMES.map((name) => (
										<SelectItem key={name} value={name}>
											<PriorityBadge value={priorityValue(name)} />
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("issues.assignee")}</Label>
							<Select
								value={assigneeId}
								onValueChange={(v) => v !== null && setAssigneeId(v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{assigneeId === UNASSIGNED
											? t("common.unassigned")
											: (members.find((m) => m.userId === assigneeId)?.user
													.name ?? t("common.unassigned"))}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNASSIGNED}>
										{t("common.unassigned")}
									</SelectItem>
									{members.map((member) => (
										<SelectItem key={member.userId} value={member.userId}>
											{member.user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("issues.dueDate")}</Label>
							<Input
								type="date"
								value={dueDate}
								onChange={(e) => setDueDate(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("issues.estimate")}</Label>
							<Input
								type="number"
								min={0}
								max={100}
								step={1}
								value={estimate}
								onChange={(e) => setEstimate(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								{t("issues.estimateUnit")}
							</p>
							{!estimateValid && (
								<p className="text-destructive text-xs">
									{t("issues.estimateInvalid")}
								</p>
							)}
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label>{t("issues.labels")}</Label>
						<MultiSelect
							placeholder={t("issues.noLabels")}
							value={labelIds}
							options={labels.map((label) => ({
								value: label.id,
								label: label.name,
							}))}
							onChange={setLabelIds}
						/>
					</div>
					{createMutation.isError && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{apiErrorMessage(t, createMutation.error)}
							</AlertDescription>
						</Alert>
					)}
					<DialogFooter>
						<Button
							type="submit"
							disabled={createMutation.isPending || !estimateValid}
						>
							{t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
