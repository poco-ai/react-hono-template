import { PLANS } from "@workspace/shared";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function UpgradeDialog({
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
			title={t("billing.mockUpgradeTitle")}
			description={t("billing.mockUpgradeDescription", {
				price: `$${PLANS.pro.price}`,
			})}
			confirmLabel={t("billing.upgrade")}
			variant="default"
			pending={pending}
			onConfirm={onConfirm}
		/>
	);
}
