import { useTranslation } from "react-i18next";
import { ForgotPassword } from "@/components/auth/forgot-password";
import { PublicAuthScreen } from "@/components/public-auth-screen";

export function ForgotPasswordPage() {
	const { t } = useTranslation();

	return (
		<PublicAuthScreen title={t("forgotPassword.title")}>
			<ForgotPassword />
		</PublicAuthScreen>
	);
}
