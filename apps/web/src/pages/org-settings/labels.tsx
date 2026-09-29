import type { LabelDto } from "@api/dto/label.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLabelSchema } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
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
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LabelBadge } from "@/components/issue/label-badge";
import { client, unwrap } from "@/lib/api";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { labelsQuery } from "@/lib/queries/labels";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useOrgFrozen } from "@/lib/use-org-frozen";
import { useOrgRole } from "@/lib/use-org-role";

const DEFAULT_COLOR = "#94a3b8";

export function LabelsSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.labels"));
	const queryClient = useQueryClient();
	const labels = useQuery(labelsQuery(orgId));
	const { canManage } = useOrgRole(orgId);
	const frozen = useOrgFrozen(orgId);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<LabelDto | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<LabelDto | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "labels"] });

	const saveMutation = useMutation({
		mutationFn: (input: { name: string; color: string }) =>
			editing
				? unwrap(
						client.api.orgs[":orgId"].labels[":labelId"].$patch({
							param: { orgId, labelId: editing.id },
							json: input,
						}),
					)
				: unwrap(
						client.api.orgs[":orgId"].labels.$post({
							param: { orgId },
							json: input,
						}),
					),
		onSuccess: () => {
			invalidate();
			setDialogOpen(false);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (labelId: string) =>
			unwrap(
				client.api.orgs[":orgId"].labels[":labelId"].$delete({
					param: { orgId, labelId },
				}),
			),
		onSuccess: () => {
			invalidate();
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
				<p className="py-8 text-center text-sm text-red-500">
					{labels.error.message}
				</p>
			)}
			{labels.data?.length === 0 && (
				<div className="border-muted-foreground/25 rounded-xl border border-dashed py-12 text-center">
					<p className="text-muted-foreground">{t("labels.empty")}</p>
				</div>
			)}
			{labels.data && labels.data.length > 0 && (
				<div className="overflow-hidden rounded-lg border">
					{labels.data.map((label) => (
						<div
							key={label.id}
							className="flex items-center justify-between border-b px-3 py-2 last:border-b-0"
						>
							<LabelBadge label={label} className="text-sm" />
							{canManage && (
								<div className="flex items-center gap-1">
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
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{deleteMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>{deleteMutation.error.message}</AlertDescription>
				</Alert>
			)}

			<LabelDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				label={editing}
				pending={saveMutation.isPending}
				error={saveMutation.error}
				onSubmit={(input) => saveMutation.mutate(input)}
			/>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("labels.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("labels.deleteDescription", {
								name: deleteTarget?.name ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								if (deleteTarget) {
									deleteMutation.mutate(deleteTarget.id);
								}
							}}
						>
							{t("common.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
	const [name, setName] = useState("");
	const [color, setColor] = useState(DEFAULT_COLOR);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	useEffect(() => {
		if (open) {
			setName(label?.name ?? "");
			setColor(label?.color ?? DEFAULT_COLOR);
			setFieldErrors({});
		}
	}, [open, label]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{label ? t("labels.editTitle") : t("labels.createTitle")}
					</DialogTitle>
					<DialogDescription>{t("labels.createDescription")}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						const parsed = createLabelSchema.safeParse({
							name: name.trim(),
							color,
						});
						if (!parsed.success) {
							const errors = fieldErrorsFromZod(parsed.error, t);
							setFieldErrors(errors);
							focusFirstInvalidField(errors, { name: "label-name" });
							return;
						}
						onSubmit(parsed.data);
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="label-name">{t("labels.name")}</Label>
						<Input
							id="label-name"
							value={name}
							placeholder={t("labels.namePlaceholder")}
							onChange={(e) => {
								setName(e.target.value);
								setFieldErrors((prev) => withoutFieldError(prev, "name"));
							}}
							maxLength={30}
							aria-invalid={fieldErrors.name ? true : undefined}
							aria-describedby={
								fieldErrors.name ? "label-name-error" : undefined
							}
						/>
						{fieldErrors.name && (
							<p id="label-name-error" className="text-destructive text-sm">
								{fieldErrors.name}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="label-color">{t("labels.color")}</Label>
						<Input
							id="label-color"
							type="color"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className="h-9 w-16 p-1"
						/>
					</div>
					{error && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>{error.message}</AlertDescription>
						</Alert>
					)}
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
