import { PLANS } from "@workspace/shared";
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
import { useTranslation } from "react-i18next";

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
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("billing.mockUpgradeTitle")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("billing.mockUpgradeDescription", {
							price: `$${PLANS.pro.price}`,
						})}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={(e) => {
							e.preventDefault();
							onConfirm();
						}}
					>
						{t("billing.upgrade")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
