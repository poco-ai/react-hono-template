import { useTranslation } from "react-i18next";
import { SignIn } from "@/components/auth/sign-in";
import { PublicAuthScreen } from "@/components/public-auth-screen";

export function LoginPage() {
	const { t } = useTranslation();

	return (
		<PublicAuthScreen title={t("login.title")}>
			<SignIn />
		</PublicAuthScreen>
	);
}
