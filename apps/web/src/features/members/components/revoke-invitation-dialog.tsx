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
import type { OrgInvitation } from "@/features/members/data";

export function RevokeInvitationDialog({
	open,
	onOpenChange,
	invitation,
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	invitation: OrgInvitation | null;
	pending: boolean;
	onConfirm: (invitationId: string) => void;
}) {
	const { t } = useTranslation();

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("members.revokeTitle")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("members.revokeDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={pending}
						onClick={(e) => {
							e.preventDefault();
							if (invitation) {
								onConfirm(invitation.id);
							}
						}}
					>
						{t("members.revoke")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
