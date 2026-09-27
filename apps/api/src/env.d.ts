declare global {
	namespace Cloudflare {
		interface Env {
			BETTER_AUTH_SECRET: string;
		}
	}

	interface Env {
		BETTER_AUTH_SECRET: string;
	}
}

export {};
