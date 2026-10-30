import {
	getAdditionalFieldDefaultValues,
	getAdditionalFieldSubmitValues,
	validateStringLength,
} from "@better-auth-ui/core";
import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import { useCreateOrganization } from "@better-auth-ui/react/plugins/organization";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { buttonVariants } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Briefcase, CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRefreshOrganizations } from "@/features/organizations/data";
import { organizationCopy } from "@/lib/auth/auth-localization";
import { organizationActionMessage } from "@/lib/auth/organization-errors";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { slugify } from "@/lib/format";
import {
	getAuthAdditionalFieldValidators,
	isAuthFormFieldInvalid,
	useAuthForm,
} from "../auth-form";
import { SlugField } from "./slug-field";

/** Lowercase letters, numbers, and single hyphens. No leading or trailing hyphen. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CreatedOrganization = { id: string };

/** Props for the `CreateOrganizationDialog` component. */
export type CreateOrganizationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hideSlug?: boolean;
	onCreated?: (organization: CreatedOrganization) => void | Promise<void>;
};

export function CreateOrganizationForm({
	active = true,
	hideSlug = false,
	showHeading = false,
	onCancel,
	onCreated,
}: {
	active?: boolean;
	hideSlug?: boolean;
	showHeading?: boolean;
	onCancel?: () => void;
	onCreated?: (organization: CreatedOrganization) => void | Promise<void>;
}) {
	const { t } = useTranslation();
	const refreshOrganizations = useRefreshOrganizations();
	const { authClient, localization } = useAuth<OrganizationAuthClient>();
	const { additionalFields, localization: organizationLocalization } =
		useAuthPlugin(organizationPlugin);
	const copy = organizationCopy(organizationLocalization);
	const [slugEdited, setSlugEdited] = useState(false);
	const [submitError, setSubmitError] = useState<unknown>(null);
	const submissionGeneration = useRef(0);
	const submissionAttemptGeneration = useRef(0);

	const { mutateAsync: createOrganization } = useCreateOrganization(authClient);

	const form = useAuthForm({
		defaultValues: {
			additionalFields: getAdditionalFieldDefaultValues(additionalFields),
			name: "",
			slug: "",
		},
		onSubmit: async ({ value }) => {
			const generation = submissionAttemptGeneration.current;
			if (generation !== submissionGeneration.current) return;
			setSubmitError(null);
			try {
				const created = await createOrganization({
					...getAdditionalFieldSubmitValues(
						additionalFields,
						value.additionalFields,
					),
					name: value.name.trim(),
					slug: hideSlug ? undefined : value.slug.trim(),
				});
				await refreshOrganizations();
				if (generation !== submissionGeneration.current) return;
				await onCreated?.(created);
			} catch (error) {
				if (generation === submissionGeneration.current) setSubmitError(error);
			}
		},
	});

	useEffect(() => {
		if (!active) {
			submissionGeneration.current += 1;
			form.reset();
			setSlugEdited(false);
			setSubmitError(null);
		}
	}, [active, form]);

	return (
		<form.AppForm>
			<form.AuthFormRoot
				className="flex flex-col gap-6"
				onBeforeSubmit={() => {
					submissionAttemptGeneration.current = submissionGeneration.current;
				}}
			>
				{showHeading && (
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Briefcase />
							{organizationLocalization.createOrganization}
						</DialogTitle>
						<DialogDescription>
							{organizationLocalization.organizationsDescription}
						</DialogDescription>
					</DialogHeader>
				)}

				<div className="flex flex-col gap-4">
					<form.AppField
						name="name"
						validators={{
							onChange: ({ value }) =>
								validateStringLength(value, {
									requiredMessage: localization.auth.fieldRequired,
									trim: true,
								}),
						}}
					>
						{(field) => {
							const isInvalid = isAuthFormFieldInvalid(field.state.meta);

							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor="create-organization-name">
										{organizationLocalization.name}
									</FieldLabel>
									<Input
										id="create-organization-name"
										name={field.name}
										autoFocus
										placeholder={organizationLocalization.namePlaceholder}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => {
											const value = event.target.value;
											field.handleChange(value);
											if (!slugEdited) {
												form.setFieldValue("slug", slugify(value));
											}
										}}
										aria-invalid={isInvalid}
									/>
									<field.AuthFormFieldError />
								</Field>
							);
						}}
					</form.AppField>

					{!hideSlug && (
						<form.AppField
							name="slug"
							validators={{
								onSubmit: ({ value }) => {
									const slug = value.trim();
									if (!slug) return localization.auth.fieldRequired;
									if (!SLUG_PATTERN.test(slug)) return copy.slugInvalid;
									return undefined;
								},
							}}
						>
							{(field) => (
								<div className="flex flex-col gap-2">
									<SlugField
										id="create-organization-slug"
										value={field.state.value}
										onChange={(value) => {
											field.handleChange(value);
											setSlugEdited(true);
										}}
									/>
									<p className="text-muted-foreground text-xs">
										{copy.slugHint}
									</p>
									<field.AuthFormFieldError />
								</div>
							)}
						</form.AppField>
					)}

					{additionalFields.map((configuredField) => (
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
									optionalLabel={localization.settings.optional}
								/>
							)}
						</form.AppField>
					))}

					{submitError ? (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{organizationActionMessage(t, submitError, "onboarding.failed")}
							</AlertDescription>
						</Alert>
					) : null}
				</div>

				{onCancel ? (
					<DialogFooter>
						<DialogClose
							className={buttonVariants({ variant: "outline" })}
							type="button"
							onClick={onCancel}
						>
							{localization.settings.cancel}
						</DialogClose>
						<form.AuthFormSubmitButton>
							{organizationLocalization.createOrganization}
						</form.AuthFormSubmitButton>
					</DialogFooter>
				) : (
					<form.AuthFormSubmitButton>
						{organizationLocalization.createOrganization}
					</form.AuthFormSubmitButton>
				)}
			</form.AuthFormRoot>
		</form.AppForm>
	);
}

export function CreateOrganizationDialog({
	open,
	onOpenChange,
	hideSlug = false,
	onCreated,
}: CreateOrganizationDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<CreateOrganizationForm
					active={open}
					hideSlug={hideSlug}
					showHeading
					onCancel={() => onOpenChange(false)}
					onCreated={async (organization) => {
						await onCreated?.(organization);
						onOpenChange(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
