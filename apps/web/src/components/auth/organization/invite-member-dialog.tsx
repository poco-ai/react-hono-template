"use client";

import {
	getAdditionalFieldDefaultValues,
	getAdditionalFieldSubmitValues,
	validateEmailAddress,
} from "@better-auth-ui/core";
import {
	mergeOrganizationRoleLabels,
	type OrganizationAuthClient,
	type OrganizationRolesAuthClient,
	type OrganizationTeamsAuthClient,
} from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import {
	useActiveOrganization,
	useHasPermission,
	useInviteMember,
	useListOrganizationInvitations,
	useListRoles,
	useListTeams,
} from "@better-auth-ui/react/plugins/organization";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "cn";
import { ChevronDown, CircleAlert, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuotaError } from "@/components/quota-error";
import { SecretReveal } from "@/components/secret-reveal";
import { useOrgWriteLocked } from "@/features/organizations/org-write-lock";
import { organizationCopy } from "@/lib/auth/auth-localization";
import {
	isOrganizationQuotaError,
	organizationActionMessage,
} from "@/lib/auth/organization-errors";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { codedError } from "@/lib/errors";
import {
	getAuthAdditionalFieldValidators,
	isAuthFormFieldInvalid,
	useAuthForm,
} from "../auth-form";

/** Props for the `InviteMemberDialog` component. */
export type InviteMemberDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const pickDefaultRole = (keys: string[]) =>
	keys.includes("member") ? "member" : (keys.at(-1) ?? "");

/**
 * Render a dialog for inviting a member to the organization.
 */
export function InviteMemberDialog({
	open,
	onOpenChange,
}: InviteMemberDialogProps) {
	const { t } = useTranslation();
	const { authClient, localization } = useAuth<OrganizationAuthClient>();
	const {
		allowMultipleRoles,
		modelFields: { invitation: invitationFields },
		dynamicAccessControl,
		invitationLimit,
		localization: organizationLocalization,
		creatorRole,
		roles,
		teams: teamsEnabled,
	} = useAuthPlugin(organizationPlugin);
	const locked = useOrgWriteLocked();
	const copy = organizationCopy(organizationLocalization);
	const [createdLink, setCreatedLink] = useState<{
		email: string;
		url: string;
	} | null>(null);
	const [submitError, setSubmitError] = useState<unknown>(null);
	const { data: activeOrganization } = useActiveOrganization(authClient);
	const teams = useListTeams(authClient as OrganizationTeamsAuthClient, {
		query: { organizationId: activeOrganization?.id },
		enabled: teamsEnabled,
	});
	const invitations = useListOrganizationInvitations(authClient);
	const canInvite = useHasPermission(authClient, {
		organizationId: activeOrganization?.id,
		permissions: { invitation: ["create"] },
	});
	const canReadRoles = useHasPermission(authClient, {
		organizationId: activeOrganization?.id,
		permissions: { ac: ["read"] },
	});
	const dynamicRoles = useListRoles(authClient as OrganizationRolesAuthClient, {
		query: { organizationId: activeOrganization?.id },
		enabled:
			dynamicAccessControl?.enabled === true &&
			canReadRoles.data?.success === true,
	});
	const assignableRoles = useMemo(() => {
		const merged = mergeOrganizationRoleLabels(roles, dynamicRoles.data);
		return Object.fromEntries(
			Object.entries(merged).filter(
				([key]) => key !== creatorRole && key !== "owner",
			),
		);
	}, [creatorRole, dynamicRoles.data, roles]);
	const roleItems = Object.entries(assignableRoles).map(([value, label]) => ({
		label,
		value,
	}));
	const teamItems =
		teams.data?.map((team) => ({ label: team.name, value: team.id })) ?? [];

	const activeOrganizationId = activeOrganization?.id;
	const previousOrganizationId = useRef(activeOrganizationId);
	const wasOpen = useRef(false);

	const { mutateAsync: inviteMember, isPending: isInviting } = useInviteMember(
		authClient as OrganizationTeamsAuthClient,
		{
			onSuccess: (invitation) => {
				setSubmitError(null);
				setCreatedLink({
					email: invitation.email,
					url: `${window.location.origin}/invite?invitationId=${invitation.id}`,
				});
			},
		},
	);

	const atInvitationLimit =
		invitationLimit !== undefined &&
		(invitations.data?.filter((invitation) => invitation.status === "pending")
			.length ?? 0) >= invitationLimit;

	const form = useAuthForm({
		defaultValues: {
			additionalFields: getAdditionalFieldDefaultValues(invitationFields),
			email: "",
			roles: [] as string[],
			teamId: "",
		},
		onSubmit: async ({ value }) => {
			if (
				locked ||
				!activeOrganizationId ||
				!canInvite.data?.success ||
				value.roles.length === 0 ||
				atInvitationLimit
			)
				return;

			const teamId = teams.data?.some((team) => team.id === value.teamId)
				? value.teamId
				: undefined;

			setSubmitError(null);
			try {
				await inviteMember({
					...getAdditionalFieldSubmitValues(
						invitationFields,
						value.additionalFields,
					),
					email: value.email.trim(),
					organizationId: activeOrganizationId,
					role: value.roles as Parameters<typeof inviteMember>[0]["role"],
					teamId,
				});
			} catch (error) {
				setSubmitError(error);
			}
		},
	});

	useEffect(() => {
		const keys = Object.keys(assignableRoles);
		const current = form.getFieldValue("roles");
		const kept = current.filter((entry) => keys.includes(entry));
		const roles =
			kept.length > 0
				? allowMultipleRoles
					? kept
					: kept.slice(0, 1)
				: (() => {
						const fallback = pickDefaultRole(keys);
						return fallback ? [fallback] : [];
					})();

		form.setFieldValue("roles", roles);
	}, [allowMultipleRoles, assignableRoles, form]);

	useEffect(() => {
		const organizationChanged =
			previousOrganizationId.current !== activeOrganizationId;
		const justOpened = open && !wasOpen.current;
		wasOpen.current = open;

		if (justOpened || (open && organizationChanged)) {
			setCreatedLink(null);
			setSubmitError(null);
			const fallback = pickDefaultRole(Object.keys(assignableRoles));
			form.reset({
				additionalFields: getAdditionalFieldDefaultValues(invitationFields),
				email: "",
				roles: fallback ? [fallback] : [],
				teamId: "",
			});
		}
		previousOrganizationId.current = activeOrganizationId;
	}, [activeOrganizationId, assignableRoles, form, invitationFields, open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{createdLink ? (
					<div className="flex flex-col gap-6">
						<DialogHeader>
							<DialogTitle>
								{organizationLocalization.inviteMemberSuccess}
							</DialogTitle>
							<DialogDescription>
								{copy.inviteLinkDescription.replaceAll(
									"{{email}}",
									createdLink.email,
								)}
							</DialogDescription>
						</DialogHeader>
						<SecretReveal value={createdLink.url} />
						<DialogFooter>
							<Button type="button" onClick={() => onOpenChange(false)}>
								{copy.done}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form.AppForm>
						<form.AuthFormRoot className="flex flex-col gap-6">
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									<UserPlus />
									{organizationLocalization.inviteMember}
								</DialogTitle>

								<DialogDescription>
									{organizationLocalization.inviteMemberDescription}
								</DialogDescription>
							</DialogHeader>

							<div className="flex flex-col gap-4">
								<form.AppField
									name="email"
									validators={{
										onChange: ({ value }) =>
											validateEmailAddress(value, {
												invalidMessage: localization.auth.invalidEmail,
												requiredMessage: localization.auth.fieldRequired,
											}),
									}}
								>
									{(field) => {
										const isInvalid = isAuthFormFieldInvalid(field.state.meta);

										return (
											<Field data-invalid={isInvalid}>
												<FieldLabel htmlFor="invite-member-email">
													{localization.auth.email}
												</FieldLabel>
												<Input
													id="invite-member-email"
													name={field.name}
													type="email"
													autoFocus
													placeholder={localization.auth.email}
													disabled={isInviting}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													aria-invalid={isInvalid}
												/>
												<field.AuthFormFieldError />
											</Field>
										);
									}}
								</form.AppField>

								<form.AppField
									name="roles"
									validators={{
										onChange: ({ value }) =>
											value.length > 0
												? undefined
												: localization.auth.fieldRequired,
									}}
								>
									{(field) => {
										const selectedRoles = field.state.value;
										const roleSummary = selectedRoles
											.map((entry) => assignableRoles[entry] ?? entry)
											.join(", ");
										const toggleRole = (role: string) =>
											field.handleChange(
												selectedRoles.includes(role)
													? selectedRoles.filter((entry) => entry !== role)
													: [...selectedRoles, role],
											);

										return (
											<Field
												data-invalid={isAuthFormFieldInvalid(field.state.meta)}
											>
												<FieldLabel htmlFor="invite-member-role">
													{organizationLocalization.role}
												</FieldLabel>
												{allowMultipleRoles ? (
													<DropdownMenu>
														<DropdownMenuTrigger
															id="invite-member-role"
															disabled={isInviting}
															className={cn(
																buttonVariants({ variant: "outline" }),
																"w-full justify-between font-normal",
															)}
														>
															<span
																className={cn(
																	!roleSummary && "text-muted-foreground",
																)}
															>
																{roleSummary ||
																	organizationLocalization.selectRoles}
															</span>
															<ChevronDown className="opacity-50" />
														</DropdownMenuTrigger>

														<DropdownMenuContent
															align="start"
															className="w-(--radix-dropdown-menu-trigger-width)"
														>
															{Object.entries(assignableRoles).map(
																([key, label]) => {
																	const checked = selectedRoles.includes(key);

																	return (
																		<DropdownMenuCheckboxItem
																			key={key}
																			checked={checked}
																			disabled={
																				checked && selectedRoles.length === 1
																			}
																			onCheckedChange={() => toggleRole(key)}
																		>
																			{label}
																		</DropdownMenuCheckboxItem>
																	);
																},
															)}
														</DropdownMenuContent>
													</DropdownMenu>
												) : (
													<Select
														disabled={isInviting}
														items={roleItems}
														onValueChange={(role) =>
															role && field.handleChange([role])
														}
														value={selectedRoles[0] ?? ""}
													>
														<SelectTrigger
															id="invite-member-role"
															className="w-full"
														>
															<SelectValue
																placeholder={
																	organizationLocalization.selectRoles
																}
															/>
														</SelectTrigger>
														<SelectContent>
															<SelectGroup>
																{Object.entries(assignableRoles).map(
																	([key, label]) => (
																		<SelectItem key={key} value={key}>
																			{label}
																		</SelectItem>
																	),
																)}
															</SelectGroup>
														</SelectContent>
													</Select>
												)}
												<field.AuthFormFieldError />
											</Field>
										);
									}}
								</form.AppField>

								{teamsEnabled && (
									<form.AppField name="teamId">
										{(field) => (
											<Field>
												<FieldLabel htmlFor="invite-member-team">
													{organizationLocalization.team}
												</FieldLabel>
												<Select
													items={teamItems}
													value={field.state.value}
													onValueChange={(value) =>
														field.handleChange(value ?? "")
													}
													disabled={isInviting}
												>
													<SelectTrigger
														id="invite-member-team"
														className="w-full"
													>
														<SelectValue
															placeholder={organizationLocalization.selectTeam}
														/>
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{teamItems.map((item) => (
																<SelectItem key={item.value} value={item.value}>
																	{item.label}
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
											</Field>
										)}
									</form.AppField>
								)}

								{invitationFields.map((configuredField) => (
									<form.AppField
										key={configuredField.name}
										name={`additionalFields.${configuredField.name}`}
										validators={getAuthAdditionalFieldValidators(
											configuredField,
											localization.auth.fieldRequired,
										)}
									>
										{(field) => (
											<field.AuthFormAdditionalField
												field={configuredField}
												isPending={isInviting}
												optionalLabel={localization.settings.optional}
											/>
										)}
									</form.AppField>
								))}
							</div>

							<DialogFooter>
								<DialogClose
									className={buttonVariants({ variant: "outline" })}
									disabled={isInviting}
									type="button"
								>
									{localization.settings.cancel}
								</DialogClose>

								{submitError &&
								isOrganizationQuotaError(submitError) &&
								activeOrganizationId ? (
									<QuotaError
										error={codedError(
											submitError instanceof Error ? submitError.message : "",
											"PLAN_LIMIT_EXCEEDED",
										)}
										orgId={activeOrganizationId}
										canUpgrade={canInvite.data?.success === true}
									/>
								) : null}
								{submitError && !isOrganizationQuotaError(submitError) ? (
									<Alert variant="destructive">
										<CircleAlert />
										<AlertDescription>
											{organizationActionMessage(t, submitError)}
										</AlertDescription>
									</Alert>
								) : null}

								<form.AuthFormSubmitButton
									disabled={
										locked ||
										isInviting ||
										atInvitationLimit ||
										canInvite.isPending ||
										!canInvite.data?.success
									}
								>
									{organizationLocalization.inviteMember}
								</form.AuthFormSubmitButton>
							</DialogFooter>
						</form.AuthFormRoot>
					</form.AppForm>
				)}
			</DialogContent>
		</Dialog>
	);
}
