import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function IssueDeleteDialog({
	open,
	onOpenChange,
	issueKey,
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	issueKey: string;
	pending: boolean;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("issues.deleteTitle")}
			description={t("issues.deleteDescription", { key: issueKey })}
			confirmLabel={t("common.delete")}
			pending={pending}
			onConfirm={onConfirm}
		/>
	);
}
