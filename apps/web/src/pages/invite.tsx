import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAcceptInvitation } from "@/features/members/data";
import { errorCode } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

type InviteErrorKey =
	| "invite.errors.invitationNotFound"
	| "invite.errors.emailMismatch"
	| "invite.errors.alreadyMember"
	| "invite.errors.orgFull"
	| "invite.errors.generic";

const inviteErrorKeys: Record<string, InviteErrorKey> = {
	INVITATION_NOT_FOUND: "invite.errors.invitationNotFound",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "invite.errors.emailMismatch",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "invite.errors.alreadyMember",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "invite.errors.orgFull",
};

function getInviteErrorKey(code?: string): InviteErrorKey {
	return (code ? inviteErrorKeys[code] : undefined) ?? "invite.errors.generic";
}

export function InvitePage({ invitationId }: { invitationId: string }) {
	const { t } = useTranslation();
	const navigate = useNavigate();

	const started = useRef(false);

	const acceptMutation = useAcceptInvitation(invitationId, {
		onSuccess: () => {},
	});

	const { mutate: accept } = acceptMutation;

	useDocumentTitle(
		acceptMutation.isSuccess
			? t("invite.successTitle")
			: acceptMutation.isError
				? t("invite.errorTitle")
				: t("invite.title"),
	);

	useEffect(() => {
		if (!started.current) {
			started.current = true;
			accept();
		}
	}, [accept]);

	const goHome = () => navigate({ to: "/", replace: true });

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>
						{acceptMutation.isSuccess
							? t("invite.successTitle")
							: acceptMutation.isError
								? t("invite.errorTitle")
								: t("invite.title")}
					</CardTitle>
					<CardDescription>
						{acceptMutation.isSuccess
							? t("invite.successDescription")
							: acceptMutation.isPending
								? t("invite.accepting")
								: undefined}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{acceptMutation.isError && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{t(getInviteErrorKey(errorCode(acceptMutation.error)))}
							</AlertDescription>
						</Alert>
					)}
					{(acceptMutation.isSuccess || acceptMutation.isError) && (
						<Button onClick={goHome}>{t("invite.continue")}</Button>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
