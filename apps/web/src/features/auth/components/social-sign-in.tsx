import { Button } from "@workspace/ui/components/button";
import { useTranslation } from "react-i18next";
import { useOAuthProviders, useSignInSocial } from "@/features/auth/data";

export function SocialSignIn({
	callbackURL,
	onError,
	onAttempt,
}: {
	callbackURL: string;
	onError: (error: Error) => void;
	onAttempt?: () => void;
}) {
	const { t } = useTranslation();
	const { data } = useOAuthProviders();
	const providers = data?.providers ?? [];
	const signIn = useSignInSocial({ onError });
	if (providers.length === 0) return null;

	return (
		<div className="mb-4 flex flex-col gap-2">
			{providers.map((provider) => (
				<Button
					key={provider}
					type="button"
					variant="outline"
					disabled={signIn.isPending}
					onClick={() => {
						onAttempt?.();
						signIn.mutate({ provider, callbackURL });
					}}
				>
					{t(
						provider === "github"
							? "oauth.continueWithGitHub"
							: "oauth.continueWithGoogle",
					)}
				</Button>
			))}
			<p className="text-muted-foreground text-center text-sm">
				{t("oauth.orDivider")}
			</p>
		</div>
	);
}
