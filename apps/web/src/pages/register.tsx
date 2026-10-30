import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SignUp } from "@/components/auth/sign-up";
import { PublicAuthScreen } from "@/components/public-auth-screen";
import { bootstrapQuery } from "@/features/auth/data";

export function RegisterPage() {
	const { t } = useTranslation();
	const { data: bootstrap } = useQuery(bootstrapQuery());

	return (
		<PublicAuthScreen
			title={t("register.title")}
			notice={
				bootstrap?.hasAdmin === false ? (
					<p className="text-muted-foreground w-full text-center text-sm">
						{t("register.description")}
					</p>
				) : null
			}
		>
			<SignUp />
		</PublicAuthScreen>
	);
}
