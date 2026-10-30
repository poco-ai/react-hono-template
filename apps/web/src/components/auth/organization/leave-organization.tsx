"use client";

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { hasMemberRole } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import {
	useActiveMemberRole,
	useActiveOrganization,
	useListOrganizationMembers,
} from "@better-auth-ui/react/plugins/organization";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { LeaveOrganizationDialog } from "./leave-organization-dialog";

/**
 * Danger-zone row to leave the active organization.
 */
export function LeaveOrganization() {
	const { authClient } = useAuth<OrganizationAuthClient>();
	const { creatorRole, localization: organizationLocalization } =
		useAuthPlugin(organizationPlugin);

	const { data: activeOrganization } = useActiveOrganization(authClient);
	const { data: activeMemberRole } = useActiveMemberRole(authClient);
	const owners = useListOrganizationMembers(authClient, {
		query: {
			organizationId: activeOrganization?.id,
			filterField: "role",
			filterOperator: "contains",
			filterValue: creatorRole,
		},
		enabled: Boolean(activeOrganization?.id),
	});
	const ownerCount = owners.data?.total ?? owners.data?.members.length;
	const isOwner = hasMemberRole(activeMemberRole?.role, creatorRole);
	const soleOwner =
		isOwner &&
		!owners.isPending &&
		(ownerCount === undefined || ownerCount <= 1);

	const [confirmOpen, setConfirmOpen] = useState(false);

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p className="text-sm font-medium leading-tight">
					{organizationLocalization.leaveOrganization}
				</p>

				<p className="text-muted-foreground mt-0.5 text-xs">
					{organizationLocalization.leaveOrganizationDescription}
				</p>
			</div>

			<Button
				disabled={!activeOrganization || owners.isPending || soleOwner}
				size="sm"
				variant="outline"
				className="text-destructive"
				title={
					soleOwner
						? organizationLocalization.onlyOwnerActionDisabled
						: undefined
				}
				onClick={() => {
					if (soleOwner) return;
					setConfirmOpen(true);
				}}
			>
				{organizationLocalization.leaveOrganization}
			</Button>

			{activeOrganization && !soleOwner && (
				<LeaveOrganizationDialog
					open={confirmOpen}
					onOpenChange={setConfirmOpen}
					organization={activeOrganization}
				/>
			)}
		</div>
	);
}
