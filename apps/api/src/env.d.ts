declare global {
	namespace Cloudflare {
		interface Env {
			BETTER_AUTH_SECRET: string;
			S3_ENDPOINT?: string;
			S3_REGION?: string;
			S3_ACCESS_KEY_ID?: string;
			S3_SECRET_ACCESS_KEY?: string;
			S3_BUCKET?: string;
			S3_PUBLIC_BASE_URL?: string;
			STRIPE_SECRET_KEY?: string;
			STRIPE_PRICE_ID?: string;
			STRIPE_WEBHOOK_SECRET?: string;
			BILLING_MOCK_MODE?: string;
		}
	}

	interface Env {
		BETTER_AUTH_SECRET: string;
		S3_ENDPOINT?: string;
		S3_REGION?: string;
		S3_ACCESS_KEY_ID?: string;
		S3_SECRET_ACCESS_KEY?: string;
		S3_BUCKET?: string;
		S3_PUBLIC_BASE_URL?: string;
		STRIPE_SECRET_KEY?: string;
		STRIPE_PRICE_ID?: string;
		STRIPE_WEBHOOK_SECRET?: string;
		BILLING_MOCK_MODE?: string;
	}
}

export {};
