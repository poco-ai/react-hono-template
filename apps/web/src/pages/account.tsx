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
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import {
	useChangePassword,
	useSession,
	useUpdateUserName,
} from "@/features/auth/data";
import { apiErrorMessage } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { useDocumentTitle } from "@/lib/use-document-title";

const profileSchema = z.object({
	name: z.string().trim().min(1),
});

const passwordSchema = z.object({
	currentPassword: z.string().min(1),
	password: z.string().min(8),
	confirmPassword: z.string().min(1),
});

const PROFILE_INPUT_IDS = { name: "account-name" };
const PASSWORD_INPUT_IDS = {
	currentPassword: "account-current-password",
	password: "account-new-password",
	confirmPassword: "account-confirm-password",
};

export function AccountPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("account.title"));

	const { data: session } = useSession();
	const [name, setName] = useState("");
	const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
	const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});
	const passwordForm = useRef<HTMLFormElement>(null);

	useEffect(() => {
		if (session?.user.name !== undefined) {
			setName(session.user.name);
		}
	}, [session?.user.name]);

	const updateName = useUpdateUserName({
		onSuccess: () => {
			setProfileErrors({});
			toast.success(t("account.nameUpdated"));
		},
	});

	const changePassword = useChangePassword({
		onSuccess: () => {
			setPasswordErrors({});
			passwordForm.current?.reset();
			toast.success(t("account.passwordUpdated"));
		},
	});

	const onProfileSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = profileSchema.safeParse({ name });
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t);
			setProfileErrors(errors);
			focusFirstInvalidField(errors, PROFILE_INPUT_IDS);
			return;
		}
		updateName.mutate(parsed.data);
	};

	const onPasswordSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const data = new FormData(e.currentTarget);
		const parsed = passwordSchema.safeParse({
			currentPassword: String(data.get("currentPassword") ?? ""),
			password: String(data.get("password") ?? ""),
			confirmPassword: String(data.get("confirmPassword") ?? ""),
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t);
			setPasswordErrors(errors);
			focusFirstInvalidField(errors, PASSWORD_INPUT_IDS);
			return;
		}
		if (parsed.data.password !== parsed.data.confirmPassword) {
			const errors = { confirmPassword: t("account.mismatch") };
			setPasswordErrors(errors);
			focusFirstInvalidField(errors, PASSWORD_INPUT_IDS);
			return;
		}
		changePassword.mutate({
			currentPassword: parsed.data.currentPassword,
			newPassword: parsed.data.password,
		});
	};

	const dirty = name.trim() !== session?.user.name;

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
			<div>
				<h1 className="text-lg font-medium">{t("account.title")}</h1>
				<p className="text-muted-foreground text-sm">
					{t("account.description")}
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>{t("account.profileTitle")}</CardTitle>
					<CardDescription>{t("account.profileDescription")}</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						noValidate
						className="flex flex-col gap-4"
						onSubmit={onProfileSubmit}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-name">{t("common.name")}</Label>
							<Input
								id="account-name"
								value={name}
								aria-invalid={profileErrors.name ? true : undefined}
								aria-describedby={
									profileErrors.name ? "account-name-error" : undefined
								}
								onChange={(e) => {
									setName(e.target.value);
									setProfileErrors((prev) => withoutFieldError(prev, "name"));
								}}
							/>
							{profileErrors.name && (
								<p id="account-name-error" className="text-destructive text-sm">
									{profileErrors.name}
								</p>
							)}
						</div>
						{updateName.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{apiErrorMessage(t, updateName.error)}
								</AlertDescription>
							</Alert>
						)}
						<Button
							type="submit"
							className="self-start"
							disabled={updateName.isPending || !dirty}
						>
							{t("common.save")}
						</Button>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t("account.passwordTitle")}</CardTitle>
					<CardDescription>{t("account.passwordDescription")}</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						ref={passwordForm}
						noValidate
						className="flex flex-col gap-4"
						onSubmit={onPasswordSubmit}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-current-password">
								{t("account.currentPassword")}
							</Label>
							<Input
								id="account-current-password"
								name="currentPassword"
								type="password"
								aria-invalid={passwordErrors.currentPassword ? true : undefined}
								aria-describedby={
									passwordErrors.currentPassword
										? "account-current-password-error"
										: undefined
								}
								onChange={() =>
									setPasswordErrors((prev) =>
										withoutFieldError(prev, "currentPassword"),
									)
								}
							/>
							{passwordErrors.currentPassword && (
								<p
									id="account-current-password-error"
									className="text-destructive text-sm"
								>
									{passwordErrors.currentPassword}
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-new-password">
								{t("account.newPassword")}
							</Label>
							<Input
								id="account-new-password"
								name="password"
								type="password"
								aria-invalid={passwordErrors.password ? true : undefined}
								aria-describedby={
									passwordErrors.password
										? "account-new-password-error"
										: undefined
								}
								onChange={() =>
									setPasswordErrors((prev) =>
										withoutFieldError(prev, "password"),
									)
								}
							/>
							{passwordErrors.password && (
								<p
									id="account-new-password-error"
									className="text-destructive text-sm"
								>
									{passwordErrors.password}
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-confirm-password">
								{t("account.confirmPassword")}
							</Label>
							<Input
								id="account-confirm-password"
								name="confirmPassword"
								type="password"
								aria-invalid={passwordErrors.confirmPassword ? true : undefined}
								aria-describedby={
									passwordErrors.confirmPassword
										? "account-confirm-password-error"
										: undefined
								}
								onChange={() =>
									setPasswordErrors((prev) =>
										withoutFieldError(prev, "confirmPassword"),
									)
								}
							/>
							{passwordErrors.confirmPassword && (
								<p
									id="account-confirm-password-error"
									className="text-destructive text-sm"
								>
									{passwordErrors.confirmPassword}
								</p>
							)}
						</div>
						{changePassword.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{t("account.passwordFailed")}
								</AlertDescription>
							</Alert>
						)}
						<Button
							type="submit"
							className="self-start"
							disabled={changePassword.isPending}
						>
							{t("common.save")}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
