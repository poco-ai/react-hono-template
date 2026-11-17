export const DEFAULT_TRUSTED_ORIGINS = [
	"http://localhost:5173",
	"https://react-hono-web.poco-ai.workers.dev",
];

/** Comma-separated origin list. Empty values keep the Cloudflare defaults. */
export const resolveTrustedOrigins = (value: string | undefined): string[] => {
	const origins = (value ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);
	return origins.length > 0 ? origins : DEFAULT_TRUSTED_ORIGINS;
};
