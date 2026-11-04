import type { StatusDto } from "@api/dto/status.dto";
import { useQuery } from "@tanstack/react-query";
import {
	createStatusSchema,
	STATUS_CATEGORIES,
	STATUS_CATEGORY_COLORS,
	type StatusCategory,
} from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ColorSwatchPicker } from "@workspace/ui/components/color-swatch-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
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
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import {
	ArrowDown,
	ArrowUp,
	CircleAlert,
	Pencil,
	Plus,
	Star,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { MutationError } from "@/components/mutation-error";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import {
	statusesQuery,
	useDeleteStatus,
	useReorderStatuses,
	useSaveStatus,
	useSetDefaultStatus,
} from "@/features/statuses/data";
import { apiErrorMessage } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { useDocumentTitle } from "@/lib/use-document-title";

const DEFAULT_COLOR = STATUS_CATEGORY_COLORS.backlog;

export function StatusesSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.statuses"));

	const statuses = useQuery(statusesQuery(orgId));
	const { canManage } = useOrgRole(orgId);
	const frozen = useOrgFrozen(orgId);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<StatusDto | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<StatusDto | null>(null);

	const saveMutation = useSaveStatus(orgId, editing?.id, {
		onSuccess: () => {
			toast.success(t(editing ? "toast.statusUpdated" : "toast.statusCreated"));
			setDialogOpen(false);
		},
	});

	const reorderMutation = useReorderStatuses(orgId, {
		onSuccess: () => toast.success(t("toast.statusReordered")),
	});

	const defaultMutation = useSetDefaultStatus(orgId, {
		onSuccess: () => toast.success(t("toast.statusUpdated")),
	});

	const deleteMutation = useDeleteStatus(orgId, {
		onSuccess: () => {
			toast.success(t("toast.statusDeleted"));
			setDeleteTarget(null);
		},
	});

	const list = statuses.data ?? [];
	const writable = canManage && !frozen;
	const busy = reorderMutation.isPending || saveMutation.isPending;

	const move = (index: number, direction: -1 | 1) => {
		const target = index + direction;
		if (target < 0 || target >= list.length) {
			return;
		}
		const ids = list.map((status) => status.id);
		const current = ids[index];
		const swapped = ids[target];
		if (!current || !swapped) {
			return;
		}
		ids[index] = swapped;
		ids[target] = current;
		reorderMutation.mutate(ids);
	};

	const makeDefault = (status: StatusDto) => {
		defaultMutation.mutate(status.id);
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-lg font-medium">{t("settings.statuses")}</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						{t("statuses.description")}
					</p>
				</div>
				{canManage && (
					<Button
						onClick={() => {
							setEditing(null);
							setDialogOpen(true);
						}}
						disabled={frozen}
					>
						<Plus />
						{t("statuses.create")}
					</Button>
				)}
			</div>

			{statuses.isPending && (
				<div className="flex flex-col gap-2" aria-busy="true">
					{[0, 1, 2].map((row) => (
						<Skeleton key={row} className="h-14 w-full" />
					))}
				</div>
			)}
			{statuses.isError && (
				<Alert variant="destructive" className="my-8">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, statuses.error)}
					</AlertDescription>
				</Alert>
			)}
			{statuses.data?.length === 0 && (
				<EmptyState title={t("statuses.empty")} />
			)}
			{list.length > 0 && (
				<ItemGroup className="gap-2">
					{list.map((status, index) => (
						<Item key={status.id} variant="outline" size="sm">
							<ItemContent>
								<ItemTitle className="flex items-center gap-2">
									<span
										aria-hidden="true"
										className="size-2.5 shrink-0 rounded-full"
										style={{ backgroundColor: status.color }}
									/>
									<span>{status.name}</span>
									{status.isDefault && (
										<Badge variant="secondary" className="rounded-md">
											{t("statuses.default")}
										</Badge>
									)}
								</ItemTitle>
								<ItemDescription>
									{t(`statuses.categories.${status.category}`, {
										defaultValue: status.category,
									})}
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								{writable && (
									<>
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label={t("statuses.moveUp")}
														disabled={busy || index === 0}
														onClick={() => move(index, -1)}
													>
														<ArrowUp />
													</Button>
												}
											/>
											<TooltipContent>{t("statuses.moveUp")}</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label={t("statuses.moveDown")}
														disabled={busy || index === list.length - 1}
														onClick={() => move(index, 1)}
													>
														<ArrowDown />
													</Button>
												}
											/>
											<TooltipContent>{t("statuses.moveDown")}</TooltipContent>
										</Tooltip>
										{!status.isDefault && (
											<Tooltip>
												<TooltipTrigger
													render={
														<Button
															variant="ghost"
															size="icon-sm"
															aria-label={t("statuses.setDefault")}
															disabled={busy}
															onClick={() => makeDefault(status)}
														>
															<Star />
														</Button>
													}
												/>
												<TooltipContent>
													{t("statuses.setDefault")}
												</TooltipContent>
											</Tooltip>
										)}
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label={t("statuses.edit")}
														disabled={busy}
														onClick={() => {
															setEditing(status);
															setDialogOpen(true);
														}}
													>
														<Pencil />
													</Button>
												}
											/>
											<TooltipContent>{t("statuses.edit")}</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														className="text-destructive hover:text-destructive"
														aria-label={t("common.delete")}
														disabled={busy || list.length <= 1}
														onClick={() => setDeleteTarget(status)}
													>
														<Trash2 />
													</Button>
												}
											/>
											<TooltipContent>
												{list.length <= 1
													? t("statuses.lastStatusHint")
													: t("common.delete")}
											</TooltipContent>
										</Tooltip>
									</>
								)}
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			)}

			{reorderMutation.isError && (
				<MutationError error={reorderMutation.error} />
			)}

			<StatusDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				status={editing}
				pending={saveMutation.isPending}
				error={saveMutation.error}
				onSubmit={(input) => saveMutation.mutate(input)}
			/>

			<DeleteStatusDialog
				key={deleteTarget?.id ?? "none"}
				status={deleteTarget}
				statuses={list}
				pending={deleteMutation.isPending}
				error={deleteMutation.error}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
				onConfirm={(migrateToStatusId) => {
					if (deleteTarget) {
						deleteMutation.mutate({
							statusId: deleteTarget.id,
							migrateToStatusId,
						});
					}
				}}
			/>
		</div>
	);
}

function StatusDialog({
	open,
	onOpenChange,
	status,
	pending,
	error,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	status: StatusDto | null;
	pending: boolean;
	error: Error | null;
	onSubmit: (input: {
		name: string;
		category: StatusCategory;
		color: string;
	}) => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [category, setCategory] = useState<StatusCategory>("backlog");
	const [color, setColor] = useState(DEFAULT_COLOR);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	useEffect(() => {
		if (open) {
			setName(status?.name ?? "");
			setCategory((status?.category as StatusCategory) ?? "backlog");
			setColor(status?.color ?? DEFAULT_COLOR);
			setFieldErrors({});
		}
	}, [open, status]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>
						{status ? t("statuses.editTitle") : t("statuses.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{status
							? t("statuses.editDescription")
							: t("statuses.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						const parsed = createStatusSchema.safeParse({
							name: name.trim(),
							category,
							color,
						});
						if (!parsed.success) {
							const errors = fieldErrorsFromZod(parsed.error, t);
							setFieldErrors(errors);
							focusFirstInvalidField(errors, { name: "status-name" });
							return;
						}
						onSubmit(parsed.data);
					}}
				>
					<Field data-invalid={fieldErrors.name ? true : undefined}>
						<FieldLabel htmlFor="status-name">{t("statuses.name")}</FieldLabel>
						<Input
							id="status-name"
							value={name}
							placeholder={t("statuses.namePlaceholder")}
							onChange={(event) => {
								setName(event.target.value);
								setFieldErrors((prev) => withoutFieldError(prev, "name"));
							}}
							maxLength={30}
							aria-invalid={fieldErrors.name ? true : undefined}
							aria-describedby={
								fieldErrors.name ? "status-name-error" : undefined
							}
						/>
						<FieldError id="status-name-error">{fieldErrors.name}</FieldError>
					</Field>
					<Field>
						<FieldLabel>{t("statuses.category")}</FieldLabel>
						<Select
							value={category}
							onValueChange={(value) => {
								if (value) {
									const next = value as StatusCategory;
									setCategory(next);
									if (!status) {
										setColor(STATUS_CATEGORY_COLORS[next]);
									}
								}
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue>
									{t(`statuses.categories.${category}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{STATUS_CATEGORIES.map((value) => (
									<SelectItem key={value} value={value}>
										{t(`statuses.categories.${value}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel>{t("statuses.color")}</FieldLabel>
						<ColorSwatchPicker
							value={color}
							onChange={setColor}
							ariaLabel={t("statuses.color")}
						/>
					</Field>
					{error && <MutationError error={error} />}
					<DialogFooter>
						<Button type="submit" disabled={pending}>
							{pending && <Spinner />}
							{status ? t("common.save") : t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteStatusDialog({
	status,
	statuses,
	pending,
	error,
	onOpenChange,
	onConfirm,
}: {
	status: StatusDto | null;
	statuses: StatusDto[];
	pending: boolean;
	error: Error | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: (migrateToStatusId: string) => void;
}) {
	const { t } = useTranslation();
	const targets = statuses.filter((entry) => entry.id !== status?.id);
	// The parent remounts this dialog per target (`key`), so the first render
	// already has the right default migration target.
	const [migrateTo, setMigrateTo] = useState(() => targets[0]?.id ?? "");

	return (
		<AlertDialog open={status !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("statuses.deleteTitle", { name: status?.name ?? "" })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("statuses.deleteDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Field>
					<FieldLabel>{t("statuses.migrateTo")}</FieldLabel>
					<Select
						value={migrateTo || null}
						onValueChange={(value) => value && setMigrateTo(value)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder={t("statuses.migratePlaceholder")}>
								{targets.find((target) => target.id === migrateTo)?.name}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{targets.map((target) => (
								<SelectItem key={target.id} value={target.id}>
									{target.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				{error && <MutationError error={error} />}
				<AlertDialogFooter>
					<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={pending || !migrateTo}
						onClick={() => onConfirm(migrateTo)}
					>
						{pending && <Spinner />}
						{t("common.delete")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
