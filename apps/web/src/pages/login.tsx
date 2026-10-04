import {
	Link,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
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
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSignIn } from "@/features/auth/data";

import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

export function LoginPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("login.title"));
	const navigate = useNavigate({ from: "/login" });
	const router = useRouter();
	const { redirect: redirectTo } = useSearch({ from: "/login" });
	const [error, setError] = useState<string | null>(null);
	const login = useSignIn({
		onError: (error) => setError(apiErrorMessage(t, error, "login.failed")),
		onSuccess: () => {
			if (redirectTo) {
				router.history.push(redirectTo);
			} else {
				navigate({ to: "/", replace: true });
			}
		},
	});

	const onSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		const form = new FormData(e.currentTarget);
		login.mutate({
			email: String(form.get("email") ?? ""),
			password: String(form.get("password") ?? ""),
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
					<CardTitle>{t("login.title")}</CardTitle>
					<CardDescription>{t("login.description")}</CardDescription>
				</CardHeader>
				<CardContent>
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
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">{t("common.password")}</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder="••••••••"
								required
							/>
						</div>
						<Link
							to="/forgot-password"
							className="text-primary -mt-2 self-end text-sm underline"
						>
							{t("login.forgotPassword")}
						</Link>
						{error && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Button type="submit" disabled={login.isPending}>
							{t("login.submit")}
						</Button>
					</form>
					<p className="text-muted-foreground mt-4 text-center text-sm">
						{t("login.noAccount")}{" "}
						<Link to="/register" className="text-primary underline">
							{t("login.registerLink")}
						</Link>
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
