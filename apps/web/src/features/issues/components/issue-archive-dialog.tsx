import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";

/**
 * Confirmation for archiving an issue. Restore is non-destructive and is
 * triggered directly from the menu instead of going through this dialog.
 */
export function IssueArchiveDialog({
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
			title={t("issues.archiveTitle")}
			description={t("issues.archiveDescription", { key: issueKey })}
			confirmLabel={t("issues.archiveAction")}
			pending={pending}
			onConfirm={onConfirm}
		/>
	);
}
