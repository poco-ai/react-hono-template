import { useQuery } from "@tanstack/react-query";
import type { RecurrenceCadence } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemTitle,
} from "@workspace/ui/components/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CalendarClock, Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MutationError } from "@/components/mutation-error";
import {
	CADENCE_OPTIONS,
	cadenceLabelKey,
	type RecurrenceDto,
	recurrencesQuery,
	useDeleteRecurrence,
	useUpdateRecurrence,
} from "@/features/recurrences/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

/** Project-level list of recurring issues with pause/resume, cadence and delete. */
export function RecurrencesSheet({
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
	const query = useQuery({
		...recurrencesQuery(orgId, projectId),
		enabled: open,
	});
	const [deleting, setDeleting] = useState<RecurrenceDto | null>(null);

	const updateMutation = useUpdateRecurrence(orgId, projectId, {
		onSuccess: () => toast.success(t("toast.recurrenceUpdated")),
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});
	const deleteMutation = useDeleteRecurrence(orgId, projectId, {
		onSuccess: () => {
			toast.success(t("toast.recurrenceDeleted"));
			setDeleting(null);
		},
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});

	const recurrences = query.data ?? [];

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full gap-0 sm:max-w-md">
				<SheetHeader className="border-b">
					<SheetTitle className="flex items-center gap-2">
						<CalendarClock className="size-4" />
						{t("recurrences.title")}
					</SheetTitle>
					<SheetDescription>{t("recurrences.description")}</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-2 overflow-y-auto p-4">
					{frozen && (
						<Alert>
							<AlertDescription>{t("recurrences.frozenHint")}</AlertDescription>
						</Alert>
					)}
					{query.isPending ? (
						<div className="flex flex-col gap-2" aria-busy="true">
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-16 w-full" />
						</div>
					) : query.isError ? (
						<Alert variant="destructive">
							<AlertDescription>
								{apiErrorMessage(t, query.error)}
							</AlertDescription>
						</Alert>
					) : recurrences.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<CalendarClock />
								</EmptyMedia>
								<EmptyTitle>{t("recurrences.emptyTitle")}</EmptyTitle>
								<EmptyDescription>
									{t("recurrences.emptyDescription")}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						recurrences.map((recurrence) => (
							<Item key={recurrence.id} variant="outline">
								<ItemContent className="min-w-0">
									<ItemTitle className="truncate">{recurrence.title}</ItemTitle>
									<ItemDescription className="flex flex-wrap items-center gap-2">
										<Badge
											variant={recurrence.active ? "secondary" : "outline"}
										>
											{recurrence.active
												? t("recurrences.active")
												: t("recurrences.paused")}
										</Badge>
										<span>
											{t("recurrences.nextRun")}:{" "}
											{formatDateTime(recurrence.nextRunAt)}
										</span>
									</ItemDescription>
									<Select
										value={recurrence.cadence}
										disabled={frozen || updateMutation.isPending}
										onValueChange={(value) =>
											updateMutation.mutate({
												recurrenceId: recurrence.id,
												input: { cadence: value as RecurrenceCadence },
											})
										}
									>
										<SelectTrigger
											size="sm"
											className="mt-1 w-36"
											aria-label={t("recurrences.editCadence")}
										>
											<SelectValue>
												{t(cadenceLabelKey(recurrence.cadence))}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{CADENCE_OPTIONS.map((option) => (
												<SelectItem key={option} value={option}>
													{t(cadenceLabelKey(option))}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</ItemContent>
								<ItemActions className="flex-col">
									<Button
										variant="ghost"
										size="icon-sm"
										disabled={frozen || updateMutation.isPending}
										aria-label={
											recurrence.active
												? t("recurrences.pause")
												: t("recurrences.resume")
										}
										title={
											recurrence.active
												? t("recurrences.pause")
												: t("recurrences.resume")
										}
										onClick={() =>
											updateMutation.mutate({
												recurrenceId: recurrence.id,
												input: { active: !recurrence.active },
											})
										}
									>
										{recurrence.active ? <Pause /> : <Play />}
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										disabled={frozen || deleteMutation.isPending}
										aria-label={t("recurrences.delete")}
										title={t("recurrences.delete")}
										onClick={() => setDeleting(recurrence)}
									>
										<Trash2 />
									</Button>
								</ItemActions>
							</Item>
						))
					)}
					{updateMutation.isError && (
						<MutationError error={updateMutation.error} />
					)}
				</div>
			</SheetContent>
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(value) => {
					if (!value) {
						setDeleting(null);
					}
				}}
				title={t("recurrences.deleteTitle")}
				description={
					deleting
						? t("recurrences.deleteDescription", { title: deleting.title })
						: undefined
				}
				confirmLabel={t("common.delete")}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleting) {
						deleteMutation.mutate(deleting.id);
					}
				}}
			/>
		</Sheet>
	);
}
