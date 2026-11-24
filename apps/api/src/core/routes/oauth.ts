import { Hono } from "hono";
import { createOAuthController } from "../controllers/oauth.controller";
import type { SocialProvidersConfig } from "../lib/social-providers";

export const createOAuthRoutes = (social?: SocialProvidersConfig) => {
	const oauthController = createOAuthController(social);
	return new Hono().get("/api/oauth/providers", (c) =>
		oauthController.providers(c),
	);
};
