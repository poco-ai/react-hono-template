import type { LabelDto } from "@api/features/labels/dto/label.dto";
import { useQuery } from "@tanstack/react-query";
import { createLabelSchema } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
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
	ItemGroup,
} from "@workspace/ui/components/item";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { MutationError } from "@/components/mutation-error";
import { LabelBadge } from "@/features/labels/components/label-badge";
import {
	labelsQuery,
	useDeleteLabel,
	useSaveLabel,
} from "@/features/labels/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useZodForm } from "@/lib/use-zod-form";

const DEFAULT_COLOR = "#94a3b8";

type LabelFormValues = { name: string; color: string };

const labelFormSchema = z.preprocess((values) => {
	// Guard non-object input so the wrapper cannot throw a TypeError before zod
	// gets a chance to report validation issues.
	if (!values || typeof values !== "object") {
		return values;
	}
	const input = values as LabelFormValues;
	return { name: input.name.trim(), color: input.color };
}, createLabelSchema);

const INPUT_IDS = { name: "label-name" };

export function LabelsSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.labels"));

	const labels = useQuery(labelsQuery(orgId));
	const { canManage } = useOrgRole(orgId);
	const frozen = useOrgFrozen(orgId);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<LabelDto | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<LabelDto | null>(null);

	const saveMutation = useSaveLabel(orgId, editing?.id, {
		onSuccess: () => {
			toast.success(t(editing ? "toast.labelUpdated" : "toast.labelCreated"));

			setDialogOpen(false);
		},
	});

	const deleteMutation = useDeleteLabel(orgId, {
		onSuccess: () => {
			toast.success(t("toast.labelDeleted"));

			setDeleteTarget(null);
		},
	});

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-medium">{t("settings.labels")}</h2>
				{canManage && (
					<Button
						onClick={() => {
							setEditing(null);
							setDialogOpen(true);
						}}
						disabled={frozen}
					>
						<Plus />
						{t("labels.create")}
					</Button>
				)}
			</div>

			{labels.isPending && (
				<p className="text-muted-foreground py-8 text-center text-sm">
					{t("common.loading")}
				</p>
			)}
			{labels.isError && (
				<Alert variant="destructive" className="my-8">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, labels.error)}
					</AlertDescription>
				</Alert>
			)}
			{labels.data?.length === 0 && <EmptyState title={t("labels.empty")} />}
			{labels.data && labels.data.length > 0 && (
				<ItemGroup className="gap-2">
					{labels.data.map((label) => (
						<Item key={label.id} variant="outline" size="sm">
							<ItemContent>
								<LabelBadge label={label} className="text-sm" />
							</ItemContent>
							{canManage && (
								<ItemActions>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={t("labels.edit")}
													disabled={frozen}
													onClick={() => {
														setEditing(label);
														setDialogOpen(true);
													}}
												>
													<Pencil />
												</Button>
											}
										/>
										<TooltipContent>{t("labels.edit")}</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													className="text-destructive hover:text-destructive"
													aria-label={t("common.delete")}
													disabled={frozen}
													onClick={() => setDeleteTarget(label)}
												>
													<Trash2 />
												</Button>
											}
										/>
										<TooltipContent>{t("common.delete")}</TooltipContent>
									</Tooltip>
								</ItemActions>
							)}
						</Item>
					))}
				</ItemGroup>
			)}

			{deleteMutation.isError && <MutationError error={deleteMutation.error} />}

			<LabelDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				label={editing}
				pending={saveMutation.isPending}
				error={saveMutation.error}
				onSubmit={(input) => saveMutation.mutate(input)}
			/>

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
				title={t("labels.deleteTitle")}
				description={t("labels.deleteDescription", {
					name: deleteTarget?.name ?? "",
				})}
				confirmLabel={t("common.delete")}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) {
						deleteMutation.mutate(deleteTarget.id);
					}
				}}
			/>
		</div>
	);
}

function LabelDialog({
	open,
	onOpenChange,
	label,
	pending,
	error,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	label: LabelDto | null;
	pending: boolean;
	error: Error | null;
	onSubmit: (input: { name: string; color: string }) => void;
}) {
	const { t } = useTranslation();
	const { form, fieldErrors, handleSubmit, reset } =
		useZodForm<LabelFormValues>({
			defaultValues: { name: "", color: DEFAULT_COLOR },
			schema: labelFormSchema,
			onSubmit,
			t,
			inputIds: INPUT_IDS,
		});

	useEffect(() => {
		if (open) {
			reset({
				name: label?.name ?? "",
				color: label?.color ?? DEFAULT_COLOR,
			});
		}
	}, [open, label, reset]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>
						{label ? t("labels.editTitle") : t("labels.createTitle")}
					</DialogTitle>
					<DialogDescription>{t("labels.createDescription")}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={handleSubmit}
				>
					<form.Field name="name">
						{(field) => (
							<Field data-invalid={fieldErrors.name ? true : undefined}>
								<FieldLabel htmlFor="label-name">{t("labels.name")}</FieldLabel>
								<Input
									id="label-name"
									value={field.state.value}
									placeholder={t("labels.namePlaceholder")}
									onChange={(e) => field.handleChange(e.target.value)}
									maxLength={30}
									aria-invalid={fieldErrors.name ? true : undefined}
									aria-describedby={
										fieldErrors.name ? "label-name-error" : undefined
									}
								/>
								<FieldError id="label-name-error">
									{fieldErrors.name}
								</FieldError>
							</Field>
						)}
					</form.Field>
					<form.Field name="color">
						{(field) => (
							<Field>
								<FieldLabel>{t("labels.color")}</FieldLabel>
								<ColorSwatchPicker
									value={field.state.value}
									onChange={field.handleChange}
									ariaLabel={t("labels.color")}
								/>
							</Field>
						)}
					</form.Field>
					{error && <MutationError error={error} />}
					<DialogFooter>
						<Button type="submit" disabled={pending}>
							{label ? t("common.save") : t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
