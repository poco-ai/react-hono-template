import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DowngradeDialog({
	open,
	onOpenChange,
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pending: boolean;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("billing.mockDowngradeTitle")}
			description={t("billing.mockDowngradeDescription")}
			confirmLabel={t("billing.downgrade")}
			pending={pending}
			onConfirm={onConfirm}
		/>
	);
}
