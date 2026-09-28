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
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { slugify } from "@/lib/issue-utils";
import { type Organization, orgsQuery } from "@/lib/queries/org";

export function OnboardingPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);

	const createMutation = useMutation({
		mutationFn: async () => {
			const { data, error } = await authClient.organization.create({
				name: name.trim(),
				slug: slug || slugify(name),
			});
			if (error) {
				throw new Error(
					`[${error.code ?? "error"}] ${error.message ?? t("onboarding.failed")}`,
				);
			}
			return data;
		},
		onSuccess: (org) => {
			if (org) {
				queryClient.setQueryData<Organization[]>(
					orgsQuery().queryKey,
					(prev) => [...(prev ?? []), org],
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
		if (!slugTouched) {
			setSlug(slugify(next));
		}
	};

	const onSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!name.trim()) {
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
					<CardTitle>{t("onboarding.title")}</CardTitle>
					<CardDescription>{t("onboarding.description")}</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-4" onSubmit={onSubmit}>
						<div className="flex flex-col gap-2">
							<Label htmlFor="org-name">{t("onboarding.orgName")}</Label>
							<Input
								id="org-name"
								value={name}
								placeholder={t("onboarding.orgNamePlaceholder")}
								onChange={(e) => onNameChange(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="org-slug">{t("onboarding.slug")}</Label>
							<Input
								id="org-slug"
								value={slug}
								placeholder={t("onboarding.slugPlaceholder")}
								onChange={(e) => {
									setSlugTouched(true);
									setSlug(slugify(e.target.value));
								}}
								className="font-mono text-sm"
							/>
							<p className="text-muted-foreground text-xs">
								{t("onboarding.slugHint")}
							</p>
						</div>
						{createMutation.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{createMutation.error.message}
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
