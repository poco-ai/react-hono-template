"use client";

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import {
	useAcceptInvitation,
	useRejectInvitation,
} from "@better-auth-ui/react/plugins/organization";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@workspace/ui/components/item";
import { Spinner } from "@workspace/ui/components/spinner";
import type { Invitation } from "better-auth/client";
import { Check, CircleAlert, Clock, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRefreshOrganizations } from "@/features/organizations/data";
import { organizationActionMessage } from "@/lib/auth/organization-errors";
import { organizationPlugin } from "@/lib/auth/organization-plugin";

export type UserInvitationRowProps = {
	invitation: Invitation & { organizationName?: string };
	onAccepted?: (
		invitation: Invitation & { organizationName?: string },
	) => void | Promise<void>;
};

/**
 * Single invitation row with accept/reject actions for the current user.
 */
export function UserInvitationRow({
	invitation,
	onAccepted,
}: UserInvitationRowProps) {
	const { t } = useTranslation();
	const refreshOrganizations = useRefreshOrganizations();
	const { authClient } = useAuth<OrganizationAuthClient>();
	const { localization: organizationLocalization, roles } =
		useAuthPlugin(organizationPlugin);
	const [acceptError, setAcceptError] = useState<unknown>(null);

	const { mutate: acceptInvitation, isPending: isAccepting } =
		useAcceptInvitation(authClient, {
			onSuccess: async () => {
				await refreshOrganizations();
				await onAccepted?.(invitation);
			},
			onError: (error) => setAcceptError(error),
		});

	const { mutate: rejectInvitation, isPending: isRejecting } =
		useRejectInvitation(authClient);

	return (
		<Item>
			<ItemMedia variant="icon">
				<Clock />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>
					{invitation.organizationName}
					<Badge variant="secondary">
						{roles?.[invitation.role] ?? invitation.role}
					</Badge>
				</ItemTitle>
				<ItemDescription>
					{new Date(invitation.createdAt).toLocaleString(undefined, {
						dateStyle: "medium",
						timeStyle: "short",
					})}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
				<Button
					variant="outline"
					size="sm"
					disabled={isAccepting || isRejecting}
					onClick={() => acceptInvitation({ invitationId: invitation.id })}
				>
					{isAccepting ? <Spinner /> : <Check />}

					{organizationLocalization.accept}
				</Button>

				<Button
					variant="outline"
					size="icon"
					className="size-8 text-destructive"
					disabled={isAccepting || isRejecting}
					onClick={() => rejectInvitation({ invitationId: invitation.id })}
					aria-label={organizationLocalization.rejectInvitation}
				>
					{isRejecting ? <Spinner /> : <X />}
				</Button>
			</ItemActions>
			{acceptError ? (
				<div className="px-4 pb-3">
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>
							{organizationActionMessage(t, acceptError)}
						</AlertDescription>
					</Alert>
				</div>
			) : null}
		</Item>
	);
}
