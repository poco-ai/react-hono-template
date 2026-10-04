import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { CircleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { pendingInvitationQuery, useSession } from "@/features/auth/data";
import { useAcceptInvitation } from "@/features/members/data";
import { useCreateOrganization } from "@/features/organizations/data";

import { apiErrorMessage } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { slugify } from "@/lib/format";

import { useDocumentTitle } from "@/lib/use-document-title";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const orgSchema = z.object({
	name: z.string().trim().min(1),
	slug: z.string().min(1).regex(SLUG_PATTERN),
});

const INPUT_IDS = {
	name: "org-name",
	slug: "org-slug",
};

export function OnboardingPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("onboarding.title"));
	const navigate = useNavigate();

	const { data: session } = useSession();
	const invitations = useQuery(pendingInvitationQuery());
	const invitation = invitations.data ?? null;

	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const createMutation = useCreateOrganization({
		onSuccess: (org) => {
			if (org) {
				navigate({
					to: "/orgs/$orgId/projects",
					params: { orgId: org.id },
					replace: true,
				});
			}
		},
	});

	const acceptMutation = useAcceptInvitation(invitation?.id ?? "", {
		onSuccess: () => {
			if (invitation) {
				navigate({
					to: "/orgs/$orgId/projects",
					params: { orgId: invitation.organizationId },
					replace: true,
				});
			}
		},
	});

	const onNameChange = (next: string) => {
		setName(next);
		setFieldErrors((prev) => withoutFieldError(prev, "name"));
		if (!slugTouched) {
			setSlug(slugify(next));
		}
	};

	const onSlugChange = (next: string) => {
		setSlugTouched(true);
		setSlug(next);
		setFieldErrors((prev) => withoutFieldError(prev, "slug"));
	};

	const onSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = orgSchema.safeParse({
			name,
			slug: slug || slugify(name),
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t, {
				slug: "form.errors.slugPattern",
			});
			setFieldErrors(errors);
			focusFirstInvalidField(errors, INPUT_IDS);
			return;
		}
		createMutation.mutate(parsed.data);
	};

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<div className="absolute top-4 right-4 flex items-center gap-1">
				{session && <UserDropdown user={session.user} />}
				<LanguageSwitcher />
				<ThemeToggle />
			</div>
			<Card className="w-full max-w-sm">
				<CardHeader>
					<Logo className="pb-2" />
					<CardTitle>{t("onboarding.title")}</CardTitle>
					<CardDescription>{t("onboarding.description")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{invitation && (
						<div className="flex flex-col gap-3 rounded-lg border p-3">
							<p className="text-sm font-medium">
								{t("onboarding.invitationsTitle")}
							</p>
							<p className="text-muted-foreground text-sm">
								{t("onboarding.invitationFrom", {
									inviter: invitation.inviterEmail ?? invitation.inviterId,
									org: invitation.organizationName,
								})}
							</p>
							<Button
								type="button"
								variant="outline"
								disabled={acceptMutation.isPending}
								onClick={() => acceptMutation.mutate()}
							>
								{t("onboarding.join", { org: invitation.organizationName })}
							</Button>
							{acceptMutation.isError && (
								<Alert variant="destructive">
									<CircleAlert />
									<AlertDescription>
										{apiErrorMessage(t, acceptMutation.error)}
									</AlertDescription>
								</Alert>
							)}
						</div>
					)}
					{invitation && (
						<div className="flex items-center gap-2">
							<span className="bg-border h-px flex-1" />
							<span className="text-muted-foreground text-xs">
								{t("onboarding.orCreate")}
							</span>
							<span className="bg-border h-px flex-1" />
						</div>
					)}
					<form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
						<div className="flex flex-col gap-2">
							<Label htmlFor="org-name">{t("onboarding.orgName")}</Label>
							<Input
								id="org-name"
								value={name}
								placeholder={t("onboarding.orgNamePlaceholder")}
								onChange={(e) => onNameChange(e.target.value)}
								aria-invalid={fieldErrors.name ? true : undefined}
								aria-describedby={
									fieldErrors.name ? "org-name-error" : undefined
								}
							/>
							{fieldErrors.name && (
								<p id="org-name-error" className="text-destructive text-sm">
									{fieldErrors.name}
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="org-slug">{t("onboarding.slug")}</Label>
							<Input
								id="org-slug"
								value={slug}
								placeholder={t("onboarding.slugPlaceholder")}
								onChange={(e) => onSlugChange(e.target.value)}
								className="font-mono text-sm"
								aria-invalid={fieldErrors.slug ? true : undefined}
								aria-describedby={
									fieldErrors.slug
										? "org-slug-error org-slug-hint"
										: "org-slug-hint"
								}
							/>
							<p id="org-slug-hint" className="text-muted-foreground text-xs">
								{t("onboarding.slugHint")}
							</p>
							{fieldErrors.slug && (
								<p id="org-slug-error" className="text-destructive text-sm">
									{fieldErrors.slug}
								</p>
							)}
						</div>
						{createMutation.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{apiErrorMessage(
										t,
										createMutation.error,
										"onboarding.failed",
									)}
								</AlertDescription>
							</Alert>
						)}
						<Button type="submit" disabled={createMutation.isPending}>
							{t("onboarding.submit")}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
