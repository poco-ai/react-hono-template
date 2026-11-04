import type { ProjectUpdateDto } from "@api/dto/project-update.dto";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PROJECT_UPDATE_BODY_MAX, type ProjectHealth } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemTitle,
} from "@workspace/ui/components/item";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MarkdownContent } from "@/components/markdown";
import { MutationError } from "@/components/mutation-error";
import { UserAvatar } from "@/components/user-avatar";
import { useSession } from "@/features/auth/data";
import { useOrgRole } from "@/features/organizations/use-org-role";
import {
	projectUpdatesQuery,
	useCreateProjectUpdate,
	useDeleteProjectUpdate,
	useUpdateProjectUpdate,
} from "@/features/project-updates/data";
import { ProjectHealthBadge } from "@/features/projects/components/project-health-badge";
import { ProjectHealthSelect } from "@/features/projects/components/project-health-select";
import { projectHealthOf } from "@/features/projects/utils";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

type EditingUpdate = {
	id: string;
	body: string;
	health: ProjectHealth | null;
};

/** Timeline of project updates with an inline composer at the top. */
export function ProjectUpdatesSheet({
	orgId,
	projectId,
	open,
	onOpenChange,
	frozen,
}: {
	orgId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	frozen: boolean;
}) {
	const { t } = useTranslation();
	const { data: session } = useSession();
	const { canManage } = useOrgRole(orgId);
	const query = useInfiniteQuery({
		...projectUpdatesQuery(orgId, projectId),
		// Only load the timeline while the sheet is open.
		enabled: open,
	});

	const updates = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);
	const total = query.data?.pages[0]?.total ?? 0;

	const [body, setBody] = useState("");
	const [health, setHealth] = useState<ProjectHealth | null>(null);
	const [editing, setEditing] = useState<EditingUpdate | null>(null);
	const [deleting, setDeleting] = useState<ProjectUpdateDto | null>(null);

	const createMutation = useCreateProjectUpdate(orgId, projectId, {
		onSuccess: () => {
			toast.success(t("toast.projectUpdatePosted"));
			setBody("");
			setHealth(null);
		},
	});
	const updateMutation = useUpdateProjectUpdate(orgId, projectId, {
		onSuccess: () => {
			toast.success(t("toast.projectUpdateUpdated"));
			setEditing(null);
		},
	});
	const deleteMutation = useDeleteProjectUpdate(orgId, projectId, {
		onSuccess: () => {
			toast.success(t("toast.projectUpdateDeleted"));
			setDeleting(null);
		},
		// The confirmation dialog covers the timeline, so surface failures in a
		// toast instead of an inline error hidden behind the overlay.
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});

	const canSubmit =
		!frozen &&
		!createMutation.isPending &&
		body.trim().length > 0 &&
		body.trim().length <= PROJECT_UPDATE_BODY_MAX;

	const canManageUpdate = (update: ProjectUpdateDto) =>
		canManage || update.author?.id === session?.user.id;

	const submit = () => {
		if (!canSubmit) {
			return;
		}
		createMutation.mutate({ body: body.trim(), health });
	};

	const saveEdit = () => {
		if (!editing) {
			return;
		}
		const trimmed = editing.body.trim();
		if (trimmed.length === 0) {
			return;
		}
		updateMutation.mutate({
			updateId: editing.id,
			input: { body: trimmed, health: editing.health },
		});
	};

	return (
		<>
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
					<SheetHeader className="border-b">
						<SheetTitle>{t("projectUpdates.title")}</SheetTitle>
						<SheetDescription>
							{t("projectUpdates.description")}
						</SheetDescription>
					</SheetHeader>

					<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
						<form
							className="flex flex-col gap-3"
							onSubmit={(event) => {
								event.preventDefault();
								submit();
							}}
						>
							<Field>
								<FieldLabel htmlFor="project-update-body">
									{t("projectUpdates.composerLabel")}
								</FieldLabel>
								<Textarea
									id="project-update-body"
									value={body}
									rows={3}
									maxLength={PROJECT_UPDATE_BODY_MAX}
									placeholder={t("projectUpdates.placeholder")}
									disabled={frozen || createMutation.isPending}
									onChange={(event) => setBody(event.target.value)}
								/>
							</Field>
							<div className="flex flex-wrap items-end justify-between gap-3">
								<Field className="w-full sm:w-auto">
									<FieldLabel htmlFor="project-update-health">
										{t("projects.health")}
									</FieldLabel>
									<ProjectHealthSelect
										id="project-update-health"
										value={health}
										onChange={setHealth}
										disabled={frozen || createMutation.isPending}
									/>
								</Field>
								<Button type="submit" disabled={!canSubmit}>
									{createMutation.isPending && <Spinner />}
									{t("projectUpdates.post")}
								</Button>
							</div>
							{createMutation.isError && (
								<MutationError error={createMutation.error} />
							)}
						</form>

						<div className="flex items-center justify-between gap-2">
							<h3 className="text-sm font-semibold">
								{t("projectUpdates.timeline")}
							</h3>
							<span className="text-muted-foreground text-xs">
								{t("projectUpdates.count", { count: total })}
							</span>
						</div>

						{query.isPending && (
							<div className="flex flex-col gap-3" aria-busy="true">
								{["update-1", "update-2", "update-3"].map((key) => (
									<div
										key={key}
										className="flex flex-col gap-2 rounded-lg border p-3"
									>
										<div className="flex items-center gap-2">
											<Skeleton className="size-6 rounded-full" />
											<Skeleton className="h-3 w-32" />
											<Skeleton className="ml-auto h-5 w-16 rounded-md" />
										</div>
										<Skeleton className="h-3 w-full" />
										<Skeleton className="h-3 w-2/3" />
									</div>
								))}
							</div>
						)}

						{query.isError && (
							<div className="flex flex-col gap-2">
								<MutationError error={query.error} />
								<Button
									variant="outline"
									size="sm"
									className="self-start"
									onClick={() => void query.refetch()}
								>
									{t("common.retry")}
								</Button>
							</div>
						)}

						{!query.isPending && !query.isError && updates.length === 0 && (
							<Empty className="border">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Megaphone />
									</EmptyMedia>
									<EmptyTitle>{t("projectUpdates.emptyTitle")}</EmptyTitle>
									<EmptyDescription>
										{t("projectUpdates.empty")}
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}

						{updates.length > 0 && (
							<ol className="flex flex-col gap-3">
								{updates.map((update) => {
									const authorName = update.author
										? update.author.name
										: t("projectUpdates.deletedAuthor");
									const isEditing = editing?.id === update.id;
									return (
										<li key={update.id}>
											<Item
												variant="outline"
												className="flex-col items-stretch gap-2"
											>
												<div className="flex items-start gap-2">
													{update.author ? (
														<UserAvatar
															name={update.author.name}
															image={update.author.image}
															className="size-6 text-[10px]"
														/>
													) : (
														<UserAvatar
															name={authorName}
															className="size-6 text-[10px]"
														/>
													)}
													<ItemContent>
														<ItemTitle className="text-sm">
															{authorName}
														</ItemTitle>
														<ItemDescription>
															<span title={formatDateTime(update.createdAt)}>
																{formatRelativeTime(update.createdAt)}
															</span>
															{update.updatedAt !== update.createdAt &&
																` · ${t("projectUpdates.edited")}`}
														</ItemDescription>
													</ItemContent>
													<div className="flex items-center gap-1">
														{update.health && (
															<ProjectHealthBadge health={update.health} />
														)}
														{canManageUpdate(update) && !isEditing && (
															<ItemActions className="gap-1">
																<Button
																	variant="ghost"
																	size="icon-sm"
																	aria-label={t("projectUpdates.edit")}
																	disabled={frozen || updateMutation.isPending}
																	onClick={() =>
																		setEditing({
																			id: update.id,
																			body: update.body,
																			health: projectHealthOf(update.health),
																		})
																	}
																>
																	<Pencil />
																</Button>
																<Button
																	variant="ghost"
																	size="icon-sm"
																	aria-label={t("common.delete")}
																	disabled={frozen}
																	onClick={() => setDeleting(update)}
																>
																	<Trash2 />
																</Button>
															</ItemActions>
														)}
													</div>
												</div>

												{isEditing && editing ? (
													<div className="flex flex-col gap-2">
														<Textarea
															value={editing.body}
															rows={3}
															maxLength={PROJECT_UPDATE_BODY_MAX}
															aria-label={t("projectUpdates.edit")}
															onChange={(event) =>
																setEditing({
																	...editing,
																	body: event.target.value,
																})
															}
														/>
														<div className="flex flex-wrap items-center justify-between gap-2">
															<ProjectHealthSelect
																id={`project-update-health-${update.id}`}
																value={editing.health}
																disabled={updateMutation.isPending}
																onChange={(next) =>
																	setEditing({ ...editing, health: next })
																}
															/>
															<div className="flex items-center gap-2">
																<Button
																	variant="ghost"
																	size="sm"
																	onClick={() => setEditing(null)}
																	disabled={updateMutation.isPending}
																>
																	{t("common.cancel")}
																</Button>
																<Button
																	size="sm"
																	disabled={
																		updateMutation.isPending ||
																		editing.body.trim().length === 0
																	}
																	onClick={saveEdit}
																>
																	{updateMutation.isPending && <Spinner />}
																	{t("common.save")}
																</Button>
															</div>
														</div>
													</div>
												) : (
													<MarkdownContent>{update.body}</MarkdownContent>
												)}
											</Item>
										</li>
									);
								})}
							</ol>
						)}

						{query.hasNextPage && (
							<Button
								variant="outline"
								size="sm"
								className="self-start"
								disabled={query.isFetchingNextPage}
								onClick={() => void query.fetchNextPage()}
							>
								{query.isFetchingNextPage && <Spinner />}
								{t("common.loadMore")}
							</Button>
						)}

						{updateMutation.isError && (
							<MutationError error={updateMutation.error} />
						)}
					</div>
				</SheetContent>
			</Sheet>

			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(next) => !next && setDeleting(null)}
				title={t("projectUpdates.deleteTitle")}
				description={t("projectUpdates.deleteDescription")}
				confirmLabel={t("common.delete")}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleting) {
						deleteMutation.mutate(deleting.id);
					}
				}}
			/>
		</>
	);
}
