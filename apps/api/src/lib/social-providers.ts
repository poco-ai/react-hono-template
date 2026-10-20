export type SocialProviderId = "github" | "google";

export type SocialProviderCredentials = {
	clientId: string;
	clientSecret: string;
};

export type SocialProvidersConfig = {
	github?: SocialProviderCredentials;
	google?: SocialProviderCredentials;
};

const configured = (
	credentials: SocialProviderCredentials | undefined,
): credentials is SocialProviderCredentials =>
	Boolean(credentials?.clientId.trim() && credentials.clientSecret.trim());

export const enabledSocialProviders = (
	social?: SocialProvidersConfig,
): SocialProviderId[] => {
	const providers: SocialProviderId[] = [];
	if (configured(social?.github)) providers.push("github");
	if (configured(social?.google)) providers.push("google");
	return providers;
};
