import { useTranslation } from "react-i18next";
import { ResetPassword } from "@/components/auth/reset-password";
import { PublicAuthScreen } from "@/components/public-auth-screen";

export function ResetPasswordPage() {
	const { t } = useTranslation();

	return (
		<PublicAuthScreen title={t("resetPassword.title")}>
			<ResetPassword />
		</PublicAuthScreen>
	);
}
