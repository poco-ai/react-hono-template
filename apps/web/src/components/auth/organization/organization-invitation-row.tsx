import { formatAdditionalFieldValue } from "@better-auth-ui/core";
import {
	memberRoleLabels,
	type OrganizationAuthClient,
} from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import {
	useCancelInvitation,
	useHasPermission,
} from "@better-auth-ui/react/plugins/organization";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { TableCell, TableRow } from "@workspace/ui/components/table";
import type { Invitation } from "better-auth/client";
import { cn } from "cn";
import { X } from "lucide-react";
import { useOrgWriteLocked } from "@/features/organizations/org-write-lock";
import { organizationCopy } from "@/lib/auth/auth-localization";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { OrganizationInvitationRowSkeleton } from "./organization-invitation-row-skeleton";
import {
	type OrganizationSelectableRow,
	OrganizationTableSelectRow,
} from "./organization-table-selection";

export type OrganizationInvitationRowProps = {
	invitation: Invitation;
	selectableRow?: OrganizationSelectableRow<Invitation>;
	showCreatedAt?: boolean;
	showEmail?: boolean;
	showRole?: boolean;
	showStatus?: boolean;
};

const statusBadgeClasses: Record<string, string> = {
	pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	accepted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	rejected: "bg-destructive/10 text-destructive",
	canceled: "bg-muted text-muted-foreground",
};

export function OrganizationInvitationRow({
	invitation,
	selectableRow,
	showCreatedAt = true,
	showEmail = true,
	showRole = true,
	showStatus = true,
}: OrganizationInvitationRowProps) {
	const { authClient } = useAuth<OrganizationAuthClient>();
	const {
		modelFields: { invitation: invitationFields },
		localization: organizationLocalization,
		roles,
	} = useAuthPlugin(organizationPlugin);

	const locked = useOrgWriteLocked();
	const copy = organizationCopy(organizationLocalization);
	const {
		data: cancelInvitationPermission,
		isPending: cancelPermissionPending,
	} = useHasPermission(authClient, {
		permissions: { invitation: ["cancel"] },
	});

	const { mutate: cancelInvitation, isPending: cancelPending } =
		useCancelInvitation(authClient);

	const roleLabel = memberRoleLabels(invitation.role, roles).join(", ");

	const statusLabel =
		organizationLocalization[
			invitation.status as keyof typeof organizationLocalization
		] ?? invitation.status;

	if (cancelPermissionPending) {
		return <OrganizationInvitationRowSkeleton />;
	}

	const isPending = invitation.status === "pending";

	return (
		<TableRow
			data-state={selectableRow?.getIsSelected() ? "selected" : undefined}
		>
			{selectableRow && (
				<TableCell>
					<OrganizationTableSelectRow
						localization={organizationLocalization}
						row={selectableRow}
					/>
				</TableCell>
			)}

			{showEmail && (
				<TableCell>
					<div className="flex flex-col gap-1">
						<span className="font-medium text-sm">{invitation.email}</span>
						{invitationFields.map((field) => {
							const value = formatAdditionalFieldValue(
								(invitation as unknown as Record<string, unknown>)[field.name],
							);
							return value ? (
								<span
									className="text-xs text-muted-foreground"
									key={field.name}
								>
									{field.label}: {value}
								</span>
							) : null;
						})}
					</div>
				</TableCell>
			)}

			{showCreatedAt && (
				<TableCell className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
					{new Date(invitation.createdAt).toLocaleString(undefined, {
						dateStyle: "short",
						timeStyle: "short",
					})}
				</TableCell>
			)}

			{showRole && <TableCell className="text-sm">{roleLabel}</TableCell>}

			{showStatus && (
				<TableCell className="text-sm">
					<Badge
						variant="secondary"
						className={cn(statusBadgeClasses[invitation.status])}
					>
						{String(statusLabel)}
					</Badge>
				</TableCell>
			)}

			<TableCell className="text-end">
				<div className="flex justify-end gap-2">
					{cancelInvitationPermission?.success && isPending && (
						<Button
							size="icon"
							variant="outline"
							className="size-8 text-destructive"
							disabled={locked || cancelPending}
							title={locked ? copy.frozenNotice : undefined}
							onClick={() => {
								if (locked) return;
								cancelInvitation({ invitationId: invitation.id });
							}}
							aria-label={organizationLocalization.cancelInvitation}
						>
							{cancelPending ? <Spinner /> : <X />}
						</Button>
					)}
				</div>
			</TableCell>
		</TableRow>
	);
}
