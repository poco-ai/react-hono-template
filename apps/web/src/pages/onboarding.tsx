import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { apiErrorMessage, errorCode } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { slugify } from "@/lib/issue-utils";
import { type Organization, orgsQuery } from "@/lib/queries/org";
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
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const createMutation = useMutation({
		mutationFn: async () => {
			const { data, error } = await authClient.organization.create({
				name: name.trim(),
				slug: slug || slugify(name),
			});
			if (error) {
				throw Object.assign(
					new Error(error.message ?? t("onboarding.failed")),
					{ code: errorCode(error) },
				);
			}
			return data;
		},
		onSuccess: (org) => {
			if (org) {
				queryClient.setQueryData<Organization[]>(
					orgsQuery().queryKey,
					(prev) => [...(prev ?? []), { ...org, frozen: false }],
				);
				navigate({
					to: "/orgs/$orgId/projects",
					params: { orgId: org.id },
					replace: true,
				});
			}
			queryClient.invalidateQueries({ queryKey: orgsQuery().queryKey });
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
		createMutation.mutate();
	};

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<div className="absolute top-4 right-4 flex items-center gap-1">
				<LanguageSwitcher />
				<ThemeToggle />
			</div>
			<Card className="w-full max-w-sm">
				<CardHeader>
					<Logo className="pb-2" />
					<CardTitle>{t("onboarding.title")}</CardTitle>
					<CardDescription>{t("onboarding.description")}</CardDescription>
				</CardHeader>
				<CardContent>
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
