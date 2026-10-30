import { useTranslation } from "react-i18next";
import { AcceptInvitation } from "@/components/auth/organization/accept-invitation";
import { useDocumentTitle } from "@/lib/use-document-title";

export function InvitePage({ invitationId }: { invitationId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("invite.title"));

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<AcceptInvitation invitationId={invitationId} className="max-w-sm" />
		</div>
	);
}
