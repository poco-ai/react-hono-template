import { useTranslation } from "react-i18next";
import { EmailOtp } from "@/components/auth/email-otp/email-otp";
import { PublicAuthScreen } from "@/components/public-auth-screen";

export function EmailOtpPage() {
	const { t } = useTranslation();

	return (
		<PublicAuthScreen title={t("emailOtp.title")}>
			<EmailOtp />
		</PublicAuthScreen>
	);
}
