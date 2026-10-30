import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import { useLeaveOrganization } from "@better-auth-ui/react/plugins/organization";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Spinner } from "@workspace/ui/components/spinner";
import type { Organization } from "better-auth/client";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useRefreshOrganizations } from "@/features/organizations/data";
import { organizationCopy } from "@/lib/auth/auth-localization";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { OrganizationView } from "./organization-view";

export type LeaveOrganizationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organization: Organization;
};

export function LeaveOrganizationDialog({
	open,
	onOpenChange,
	organization,
}: LeaveOrganizationDialogProps) {
	const refreshOrganizations = useRefreshOrganizations();
	const { authClient, localization, navigate } =
		useAuth<OrganizationAuthClient>();
	const { localization: organizationLocalization } =
		useAuthPlugin(organizationPlugin);

	const { mutate: leaveOrganization, isPending } = useLeaveOrganization(
		authClient,
		{
			onSuccess: async () => {
				onOpenChange(false);
				toast.success(organizationLocalization.leftOrganization);
				await refreshOrganizations();
				navigate({ to: "/", replace: true });
			},
		},
	);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia className="bg-destructive/10 text-destructive">
						<LogOut />
					</AlertDialogMedia>

					<AlertDialogTitle>
						{organizationLocalization.leaveOrganization}
					</AlertDialogTitle>

					<AlertDialogDescription>
						{organizationCopy(organizationLocalization).leaveConfirm.replaceAll(
							"{{name}}",
							organization.name,
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>

				<Card>
					<CardContent>
						<OrganizationView organization={organization} hideRole />
					</CardContent>
				</Card>

				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>
						{localization.settings.cancel}
					</AlertDialogCancel>

					<Button
						variant="destructive"
						disabled={isPending}
						onClick={() =>
							leaveOrganization({ organizationId: organization.id })
						}
					>
						{isPending && <Spinner />}

						{organizationLocalization.leaveOrganization}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
