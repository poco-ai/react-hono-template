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
import { CircleAlert, CircleCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useResetPassword } from "@/features/auth/data";
import { apiErrorMessage, errorCode } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { useDocumentTitle } from "@/lib/use-document-title";

const resetSchema = z.object({
	password: z.string().min(8),
	confirmPassword: z.string().min(1),
});

const INPUT_IDS = {
	password: "new-password",
	confirmPassword: "confirm-password",
};

/** The token is read from the query string: the reset link emitted by
 * better-auth points at the API, which validates it and redirects here. */
export function ResetPasswordPage({ token }: { token?: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("resetPassword.title"));
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const reset = useResetPassword();

	const invalidToken = !token || errorCode(reset.error) === "INVALID_TOKEN";

	const onSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!token) {
			return;
		}
		const data = new FormData(e.currentTarget);
		const parsed = resetSchema.safeParse({
			password: String(data.get("password") ?? ""),
			confirmPassword: String(data.get("confirmPassword") ?? ""),
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t);
			setFieldErrors(errors);
			focusFirstInvalidField(errors, INPUT_IDS);
			return;
		}
		if (parsed.data.password !== parsed.data.confirmPassword) {
			const errors = { confirmPassword: t("account.mismatch") };
			setFieldErrors(errors);
			focusFirstInvalidField(errors, INPUT_IDS);
			return;
		}
		reset.mutate({ newPassword: parsed.data.password, token });
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
					<CardTitle>{t("resetPassword.title")}</CardTitle>
					{!invalidToken && !reset.isSuccess && (
						<CardDescription>{t("resetPassword.description")}</CardDescription>
					)}
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{reset.isSuccess ? (
						<>
							<Alert>
								<CircleCheck />
								<AlertDescription>
									{t("resetPassword.success")}
								</AlertDescription>
							</Alert>
							<p className="text-center text-sm">
								<Link to="/login" className="text-primary underline">
									{t("resetPassword.backToLogin")}
								</Link>
							</p>
						</>
					) : invalidToken ? (
						<>
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{t("resetPassword.invalidToken")}
								</AlertDescription>
							</Alert>
							<p className="text-center text-sm">
								<Link to="/login" className="text-primary underline">
									{t("resetPassword.backToLogin")}
								</Link>
							</p>
						</>
					) : (
						<form
							noValidate
							className="flex flex-col gap-4"
							onSubmit={onSubmit}
						>
							<div className="flex flex-col gap-2">
								<Label htmlFor="new-password">{t("account.newPassword")}</Label>
								<Input
									id="new-password"
									name="password"
									type="password"
									placeholder="••••••••"
									aria-invalid={fieldErrors.password ? true : undefined}
									aria-describedby={
										fieldErrors.password ? "password-error" : undefined
									}
									onChange={() =>
										setFieldErrors((prev) =>
											withoutFieldError(prev, "password"),
										)
									}
								/>
								{fieldErrors.password && (
									<p id="password-error" className="text-destructive text-sm">
										{fieldErrors.password}
									</p>
								)}
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="confirm-password">
									{t("account.confirmPassword")}
								</Label>
								<Input
									id="confirm-password"
									name="confirmPassword"
									type="password"
									placeholder="••••••••"
									aria-invalid={fieldErrors.confirmPassword ? true : undefined}
									aria-describedby={
										fieldErrors.confirmPassword
											? "confirm-password-error"
											: undefined
									}
									onChange={() =>
										setFieldErrors((prev) =>
											withoutFieldError(prev, "confirmPassword"),
										)
									}
								/>
								{fieldErrors.confirmPassword && (
									<p
										id="confirm-password-error"
										className="text-destructive text-sm"
									>
										{fieldErrors.confirmPassword}
									</p>
								)}
							</div>
							{reset.isError && (
								<Alert variant="destructive">
									<CircleAlert />
									<AlertDescription>
										{apiErrorMessage(t, reset.error)}
									</AlertDescription>
								</Alert>
							)}
							<Button type="submit" disabled={reset.isPending}>
								{t("resetPassword.submit")}
							</Button>
							<p className="text-muted-foreground text-center text-sm">
								<Link to="/login" className="text-primary underline">
									{t("resetPassword.backToLogin")}
								</Link>
							</p>
						</form>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
