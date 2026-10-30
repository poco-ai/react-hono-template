import { useTranslation } from "react-i18next";
import { ResetLinkSent } from "@/components/auth/reset-link-sent";
import { PublicAuthScreen } from "@/components/public-auth-screen";

export function ResetLinkSentPage() {
	const { t } = useTranslation();

	return (
		<PublicAuthScreen title={t("forgotPassword.title")}>
			<ResetLinkSent />
		</PublicAuthScreen>
	);
}
