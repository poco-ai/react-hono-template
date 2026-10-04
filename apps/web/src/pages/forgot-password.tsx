import { Link } from "@tanstack/react-router";
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
import { CircleAlert, MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRequestPasswordReset } from "@/features/auth/data";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

export function ForgotPasswordPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("forgotPassword.title"));
	const [sent, setSent] = useState(false);

	const request = useRequestPasswordReset({
		onSuccess: () => setSent(true),
	});

	const onSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		request.mutate({
			email: String(form.get("email") ?? ""),
			redirectTo: `${window.location.origin}/reset-password`,
		});
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
					<CardTitle>{t("forgotPassword.title")}</CardTitle>
					<CardDescription>{t("forgotPassword.description")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{sent ? (
						<>
							<Alert>
								<MailCheck />
								<AlertDescription>{t("forgotPassword.sent")}</AlertDescription>
							</Alert>
							{import.meta.env.DEV && (
								<p className="text-muted-foreground text-xs">
									{t("forgotPassword.devHint")}
								</p>
							)}
						</>
					) : (
						<form className="flex flex-col gap-4" onSubmit={onSubmit}>
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
							{request.isError && (
								<Alert variant="destructive">
									<CircleAlert />
									<AlertDescription>
										{apiErrorMessage(t, request.error)}
									</AlertDescription>
								</Alert>
							)}
							<Button type="submit" disabled={request.isPending}>
								{t("forgotPassword.submit")}
							</Button>
						</form>
					)}
					<p className="text-muted-foreground text-center text-sm">
						<Link to="/login" className="text-primary underline">
							{t("forgotPassword.backToLogin")}
						</Link>
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
