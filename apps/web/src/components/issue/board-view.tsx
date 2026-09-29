import type { IssueDetailDto } from "@api/dto/issue.dto";
import type { LabelDto } from "@api/dto/label.dto";
import {
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ISSUE_STATUSES, type IssueStatus } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PriorityBadge } from "@/components/issue/priority-badge";
import { StatusBadge } from "@/components/issue/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { client, unwrap } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { type IssueFilters, projectIssuesQuery } from "@/lib/queries/issues";
import type { OrgMember } from "@/lib/queries/members";

const BOARD_PAGE_SIZE = 100;

export function BoardView({
	orgId,
	projectId,
	projectKey,
	filters,
	frozen,
	members,
	labels,
	onNewIssue,
}: {
	orgId: string;
	projectId: string;
	projectKey: string;
	filters: Omit<IssueFilters, "page" | "pageSize">;
	frozen: boolean;
	members: OrgMember[];
	labels: LabelDto[];
	onNewIssue: (status: IssueStatus) => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor),
	);

	const boardFilters: IssueFilters = {
		...filters,
		page: 1,
		pageSize: BOARD_PAGE_SIZE,
	};
	const boardKey = projectIssuesQuery(orgId, projectId, boardFilters).queryKey;
	const issues = useQuery(projectIssuesQuery(orgId, projectId, boardFilters));

	const memberById = new Map(members.map((member) => [member.userId, member]));
	const labelById = new Map(labels.map((label) => [label.id, label]));

	const moveMutation = useMutation({
		mutationFn: (input: { id: string; number: number; status: IssueStatus }) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].$patch({
					param: { orgId, projectId, number: String(input.number) },
					json: { status: input.status },
				}),
			),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: boardKey });
			const previous = queryClient.getQueryData(boardKey);
			queryClient.setQueryData(boardKey, (old) => {
				if (!old) {
					return old;
				}
				return {
					...old,
					items: old.items.map((issue) =>
						issue.id === input.id ? { ...issue, status: input.status } : issue,
					),
				};
			});
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				queryClient.setQueryData(boardKey, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "issues"] });
		},
	});

	const items = issues.data?.items ?? [];
	const grouped = new Map<IssueStatus, IssueDetailDto[]>(
		ISSUE_STATUSES.map((status) => [
			status,
			items.filter((issue) => issue.status === status),
		]),
	);

	const scrollRef = useRef<HTMLDivElement>(null);
	const [overflows, setOverflows] = useState(false);
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}
		const update = () => setOverflows(el.scrollWidth > el.clientWidth);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const onDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over) {
			return;
		}
		const issue = items.find((item) => item.id === active.id);
		const status = over.id as IssueStatus;
		if (issue && issue.status !== status) {
			moveMutation.mutate({ id: issue.id, number: issue.number, status });
		}
	};

	const openIssue = (issueNumber: number) =>
		navigate({
			to: "/orgs/$orgId/projects/$projectId/$issueNumber",
			params: { orgId, projectId, issueNumber: String(issueNumber) },
		});

	return (
		<div className="flex min-h-full flex-col gap-3">
			{issues.isPending && (
				<div
					className="flex items-start gap-4 overflow-hidden pb-4"
					aria-hidden="true"
					aria-busy="true"
				>
					{ISSUE_STATUSES.map((status) => (
						<div
							key={status}
							className="flex min-w-[200px] max-w-[360px] flex-1 flex-col gap-2 rounded-lg border p-2"
						>
							<Skeleton className="mx-1 mb-1 h-5 w-20 rounded-md" />
							{["card-1", "card-2"].map((cardKey) => (
								<div
									key={cardKey}
									className="flex w-full flex-col gap-2 rounded-md border p-2.5"
								>
									<Skeleton className="h-3 w-12" />
									<Skeleton className="h-4 w-full" />
									<div className="flex items-center justify-between">
										<Skeleton className="h-4 w-14 rounded-full" />
										<Skeleton className="size-5 rounded-full" />
									</div>
								</div>
							))}
						</div>
					))}
				</div>
			)}
			{issues.isError && (
				<Alert variant="destructive" className="my-8">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, issues.error)}
					</AlertDescription>
				</Alert>
			)}
			{moveMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, moveMutation.error)}
					</AlertDescription>
				</Alert>
			)}
			{issues.data && issues.data.total > items.length && (
				<p className="text-muted-foreground px-1 text-xs">
					{t("issues.showingCap", { count: items.length })}
				</p>
			)}
			<DndContext sensors={sensors} onDragEnd={onDragEnd}>
				<div className="relative">
					<div
						ref={scrollRef}
						className="scroll-p-4 flex items-start gap-4 overflow-x-auto pb-4"
					>
						{ISSUE_STATUSES.map((status) => (
							<BoardColumn
								key={status}
								status={status}
								issues={grouped.get(status) ?? []}
								projectKey={projectKey}
								frozen={frozen}
								memberById={memberById}
								labelById={labelById}
								onNewIssue={onNewIssue}
								onOpen={openIssue}
							/>
						))}
					</div>
					{overflows && (
						<div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
					)}
				</div>
			</DndContext>
		</div>
	);
}

function BoardColumn({
	status,
	issues,
	projectKey,
	frozen,
	memberById,
	labelById,
	onNewIssue,
	onOpen,
}: {
	status: IssueStatus;
	issues: IssueDetailDto[];
	projectKey: string;
	frozen: boolean;
	memberById: Map<string, OrgMember>;
	labelById: Map<string, LabelDto>;
	onNewIssue: (status: IssueStatus) => void;
	onOpen: (issueNumber: number) => void;
}) {
	const { t } = useTranslation();
	const { setNodeRef, isOver } = useDroppable({ id: status });

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex min-w-[200px] max-w-[360px] flex-1 flex-col rounded-lg border p-2 transition-colors",
				isOver && "border-primary/60 bg-accent/50",
			)}
		>
			<div className="flex items-center justify-between px-1 pb-2">
				<div className="flex items-center gap-2">
					<StatusBadge status={status} />
					<span className="text-muted-foreground text-xs">{issues.length}</span>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("issues.newIssue")}
					disabled={frozen}
					onClick={() => onNewIssue(status)}
				>
					<Plus />
				</Button>
			</div>
			<div className="flex flex-col gap-2">
				{issues.map((issue) => (
					<BoardCard
						key={issue.id}
						issue={issue}
						projectKey={projectKey}
						frozen={frozen}
						memberById={memberById}
						labelById={labelById}
						onOpen={onOpen}
					/>
				))}
				{issues.length === 0 && (
					<div className="flex min-h-[96px] flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 px-2">
						<p className="text-muted-foreground text-center text-xs">
							{t("issues.dropHere")}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function BoardCard({
	issue,
	projectKey,
	frozen,
	memberById,
	labelById,
	onOpen,
}: {
	issue: IssueDetailDto;
	projectKey: string;
	frozen: boolean;
	memberById: Map<string, OrgMember>;
	labelById: Map<string, LabelDto>;
	onOpen: (issueNumber: number) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({ id: issue.id, disabled: frozen });
	const assignee = issue.assigneeId
		? memberById.get(issue.assigneeId)
		: undefined;

	return (
		<button
			type="button"
			ref={setNodeRef}
			style={
				transform
					? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
					: undefined
			}
			{...attributes}
			{...(frozen ? {} : listeners)}
			onClick={() => onOpen(issue.number)}
			className={cn(
				"bg-card flex w-full touch-none flex-col gap-2 rounded-md border p-2.5 text-left shadow-xs transition-shadow hover:shadow-sm",
				isDragging && "opacity-50 ring-2 ring-primary/40",
			)}
		>
			<p className="text-muted-foreground font-mono text-[11px]">
				{projectKey}-{issue.number}
			</p>
			<p className="text-sm leading-snug font-medium break-words">
				{issue.title}
			</p>
			<div className="flex items-center justify-between gap-2">
				{issue.priority !== 0 && <PriorityBadge value={issue.priority} />}
				<div className="flex min-w-0 items-center gap-1">
					<span className="flex items-center gap-0.5">
						{issue.labelIds.slice(0, 4).map((labelId) => {
							const label = labelById.get(labelId);
							return label ? (
								<span
									key={labelId}
									title={label.name}
									className="size-2 shrink-0 rounded-full border"
									style={{ backgroundColor: label.color }}
								/>
							) : null;
						})}
					</span>
					{assignee && <UserAvatar name={assignee.user.name} />}
				</div>
			</div>
		</button>
	);
}
