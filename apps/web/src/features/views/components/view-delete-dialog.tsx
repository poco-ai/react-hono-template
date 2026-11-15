import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ViewDeleteDialog({
	open,
	onOpenChange,
	viewName,
	pending,
	error,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	viewName: string;
	pending: boolean;
	error: Error | null | undefined;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("issues.views.deleteTitle")}
			description={t("issues.views.deleteDescription", { name: viewName })}
			confirmLabel={t("issues.views.delete")}
			variant="destructive"
			pending={pending}
			error={error}
			onConfirm={onConfirm}
		/>
	);
}
