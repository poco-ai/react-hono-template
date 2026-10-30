"use client";

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import { useDeleteOrganization } from "@better-auth-ui/react/plugins/organization";
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
import { Card, CardContent } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import type { Organization } from "better-auth/client";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRefreshOrganizations } from "@/features/organizations/data";
import { organizationCopy } from "@/lib/auth/auth-localization";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { useAuthForm } from "../auth-form";
import { OrganizationView } from "./organization-view";

export type DeleteOrganizationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organization: Organization;
};

export function DeleteOrganizationDialog({
	open,
	onOpenChange,
	organization,
}: DeleteOrganizationDialogProps) {
	const refreshOrganizations = useRefreshOrganizations();
	const { authClient, localization, navigate } =
		useAuth<OrganizationAuthClient>();
	const { localization: organizationLocalization } =
		useAuthPlugin(organizationPlugin);
	const copy = organizationCopy(organizationLocalization);
	const [confirmation, setConfirmation] = useState("");
	const confirmationRef = useRef("");
	confirmationRef.current = confirmation;
	const confirmed = confirmation === organization.name;

	useEffect(() => {
		if (!open) setConfirmation("");
	}, [open]);

	const { mutateAsync: deleteOrganization, isPending } = useDeleteOrganization(
		authClient,
		{
			onSuccess: async () => {
				onOpenChange(false);
				toast.success(organizationLocalization.organizationDeleted);
				await refreshOrganizations();
				navigate({ to: "/", replace: true });
			},
		},
	);

	const form = useAuthForm({
		defaultValues: {},
		onSubmit: async () => {
			if (confirmationRef.current !== organization.name) return;
			await deleteOrganization({ organizationId: organization.id });
		},
	});

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<form.AppForm>
					<form.AuthFormRoot className="flex flex-col gap-6">
						<AlertDialogHeader>
							<AlertDialogMedia className="bg-destructive/10 text-destructive">
								<TriangleAlert />
							</AlertDialogMedia>

							<AlertDialogTitle>
								{organizationLocalization.deleteOrganization}
							</AlertDialogTitle>

							<AlertDialogDescription>
								{copy.deleteNamePrompt.replaceAll(
									"{{name}}",
									organization.name,
								)}
							</AlertDialogDescription>
						</AlertDialogHeader>

						<Input
							value={confirmation}
							placeholder={organization.name}
							autoComplete="off"
							onChange={(event) => setConfirmation(event.target.value)}
						/>

						<Card>
							<CardContent>
								<OrganizationView organization={organization} hideRole />
							</CardContent>
						</Card>

						<AlertDialogFooter>
							<AlertDialogCancel disabled={isPending}>
								{localization.settings.cancel}
							</AlertDialogCancel>

							<form.AuthFormSubmitButton
								isPending={isPending}
								variant="destructive"
								disabled={isPending || !confirmed}
							>
								{organizationLocalization.deleteOrganization}
							</form.AuthFormSubmitButton>
						</AlertDialogFooter>
					</form.AuthFormRoot>
				</form.AppForm>
			</AlertDialogContent>
		</AlertDialog>
	);
}
