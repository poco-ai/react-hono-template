import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { MutationError } from "@/components/mutation-error";

export function ViewRenameDialog({
	open,
	onOpenChange,
	name,
	setName,
	pending,
	error,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	setName: Dispatch<SetStateAction<string>>;
	pending: boolean;
	error: Error | null | undefined;
	onSubmit: () => void;
}) {
	const { t } = useTranslation();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("issues.views.renameTitle")}</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim()) {
							onSubmit();
						}
					}}
				>
					<Field>
						<FieldLabel htmlFor="view-rename">
							{t("issues.views.name")}
						</FieldLabel>
						<Input
							id="view-rename"
							value={name}
							maxLength={100}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<MutationError error={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={!name.trim() || pending}>
							{t("common.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
