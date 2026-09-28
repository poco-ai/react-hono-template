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
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { bootstrapQuery } from "@/lib/queries/bootstrap";
import { sessionOptions } from "@/lib/session";

export function RegisterPage() {
	const { t } = useTranslation();
	const navigate = useNavigate({ from: "/register" });
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const { data: bootstrap } = useQuery(bootstrapQuery());

	const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		const form = new FormData(e.currentTarget);
		const { error } = await authClient.signUp.email({
			name: String(form.get("name") ?? ""),
			email: String(form.get("email") ?? ""),
			password: String(form.get("password") ?? ""),
		});
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
					<CardTitle>{t("register.title")}</CardTitle>
					{bootstrap?.hasAdmin === false && (
						<CardDescription>{t("register.description")}</CardDescription>
					)}
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-4" onSubmit={onSubmit}>
						<div className="flex flex-col gap-2">
							<Label htmlFor="name">{t("common.name")}</Label>
							<Input
								id="name"
								name="name"
								placeholder={t("register.namePlaceholder")}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">{t("common.email")}</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder={t("common.emailPlaceholder")}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">{t("common.password")}</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder={t("register.passwordPlaceholder")}
								minLength={8}
								required
							/>
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
