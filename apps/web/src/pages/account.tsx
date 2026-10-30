import { useTranslation } from "react-i18next";
import { UserProfile } from "@/components/auth/settings/account/user-profile";
import { ChangePassword } from "@/components/auth/settings/security/change-password";
import { useDocumentTitle } from "@/lib/use-document-title";

export function AccountPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("account.title"));

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
			<div>
				<h1 className="text-lg font-medium">{t("account.title")}</h1>
				<p className="text-muted-foreground text-sm">
					{t("account.description")}
				</p>
			</div>
			<UserProfile />
			<ChangePassword />
		</div>
	);
}
