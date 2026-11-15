import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { QuotaError } from "@/components/quota-error";

export type SaveForm = {
	name: string;
	shared: boolean;
	isDefault: boolean;
};

export const EMPTY_SAVE_FORM: SaveForm = {
	name: "",
	shared: false,
	isDefault: false,
};

export function ViewSaveDialog({
	open,
	onOpenChange,
	form,
	setForm,
	canManage,
	orgId,
	pending,
	error,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	form: SaveForm;
	setForm: Dispatch<SetStateAction<SaveForm>>;
	canManage: boolean;
	orgId: string;
	pending: boolean;
	error: Error | null;
	onSubmit: () => void;
}) {
	const { t } = useTranslation();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("issues.views.saveTitle")}</DialogTitle>
					<DialogDescription>
						{t("issues.views.saveDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!form.name.trim()) {
							return;
						}
						onSubmit();
					}}
				>
					<Field>
						<FieldLabel htmlFor="view-name">
							{t("issues.views.name")}
						</FieldLabel>
						<Input
							id="view-name"
							value={form.name}
							maxLength={100}
							placeholder={t("issues.views.namePlaceholder")}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									name: event.target.value,
								}))
							}
						/>
					</Field>
					{canManage && (
						<Field>
							<div className="flex items-center justify-between gap-3">
								<div>
									<FieldLabel htmlFor="view-shared">
										{t("issues.views.share")}
									</FieldLabel>
									<FieldDescription>
										{t("issues.views.shareDescription")}
									</FieldDescription>
								</div>
								<Switch
									id="view-shared"
									checked={form.shared}
									onCheckedChange={(checked) =>
										setForm((current) => ({
											...current,
											shared: checked,
										}))
									}
								/>
							</div>
						</Field>
					)}
					<Field>
						<div className="flex items-center justify-between gap-3">
							<div>
								<FieldLabel htmlFor="view-default">
									{t("issues.views.makeDefault")}
								</FieldLabel>
								<FieldDescription>
									{t("issues.views.makeDefaultDescription")}
								</FieldDescription>
							</div>
							<Switch
								id="view-default"
								checked={form.isDefault}
								onCheckedChange={(checked) =>
									setForm((current) => ({
										...current,
										isDefault: checked,
									}))
								}
							/>
						</div>
					</Field>
					<QuotaError error={error} orgId={orgId} canUpgrade={canManage} />
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={!form.name.trim() || pending}>
							{t("issues.views.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
