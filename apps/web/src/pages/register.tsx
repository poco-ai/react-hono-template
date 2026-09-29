import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
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
import { errorMessage } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { bootstrapQuery } from "@/lib/queries/bootstrap";
import { sessionOptions } from "@/lib/session";
import { useDocumentTitle } from "@/lib/use-document-title";

const registerSchema = z.object({
	name: z.string().trim().min(1),
	email: z.string().trim().min(1).email(),
	password: z.string().min(8),
});

const INPUT_IDS = {
	name: "name",
	email: "email",
	password: "password",
};

export function RegisterPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("register.title"));
	const navigate = useNavigate({ from: "/register" });
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const { data: bootstrap } = useQuery(bootstrapQuery());

	const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		const data = new FormData(e.currentTarget);
		const parsed = registerSchema.safeParse({
			name: String(data.get("name") ?? ""),
			email: String(data.get("email") ?? ""),
			password: String(data.get("password") ?? ""),
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t);
			setFieldErrors(errors);
			focusFirstInvalidField(errors, INPUT_IDS);
			return;
		}
		const { error } = await authClient.signUp.email(parsed.data);
		if (error) {
			setError(
				errorMessage({
					code: error.code ?? undefined,
					message: error.message ?? t("register.failed"),
				}),
			);
			return;
		}
		queryClient.removeQueries({ queryKey: sessionOptions.queryKey });
		navigate({ to: "/", replace: true });
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
					<CardTitle>{t("register.title")}</CardTitle>
					{bootstrap?.hasAdmin === false && (
						<CardDescription>{t("register.description")}</CardDescription>
					)}
				</CardHeader>
				<CardContent>
					<form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
						<div className="flex flex-col gap-2">
							<Label htmlFor="name">{t("common.name")}</Label>
							<Input
								id="name"
								name="name"
								placeholder={t("register.namePlaceholder")}
								aria-invalid={fieldErrors.name ? true : undefined}
								aria-describedby={fieldErrors.name ? "name-error" : undefined}
								onChange={() =>
									setFieldErrors((prev) => withoutFieldError(prev, "name"))
								}
							/>
							{fieldErrors.name && (
								<p id="name-error" className="text-destructive text-sm">
									{fieldErrors.name}
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">{t("common.email")}</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder={t("common.emailPlaceholder")}
								aria-invalid={fieldErrors.email ? true : undefined}
								aria-describedby={fieldErrors.email ? "email-error" : undefined}
								onChange={() =>
									setFieldErrors((prev) => withoutFieldError(prev, "email"))
								}
							/>
							{fieldErrors.email && (
								<p id="email-error" className="text-destructive text-sm">
									{fieldErrors.email}
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">{t("common.password")}</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder={t("register.passwordPlaceholder")}
								aria-invalid={fieldErrors.password ? true : undefined}
								aria-describedby={
									fieldErrors.password ? "password-error" : undefined
								}
								onChange={() =>
									setFieldErrors((prev) => withoutFieldError(prev, "password"))
								}
							/>
							{fieldErrors.password && (
								<p id="password-error" className="text-destructive text-sm">
									{fieldErrors.password}
								</p>
							)}
						</div>
						{error && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Button type="submit">{t("register.submit")}</Button>
					</form>
					<p className="text-muted-foreground mt-4 text-center text-sm">
						{t("register.haveAccount")}{" "}
						<Link to="/login" className="text-primary underline">
							{t("register.signInLink")}
						</Link>
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
