import { env } from "cloudflare:workers";
import { ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createStripeController } from "./controllers/stripe.controller";
import { db } from "./db";
import { createDependencies } from "./dependencies";
import { createAuth } from "./lib/auth";
import { createKvCache } from "./lib/kv/cache";
import { fail } from "./lib/response";
import type { SocialProvidersConfig } from "./lib/social-providers";
import { s3ClientFromEnv } from "./lib/storage/s3-client";
import { setupStripe } from "./lib/stripe";
import { resolveMcpConfig } from "./mcp/config";
import { createMcpEndpoint } from "./mcp/routes";
import { handleWebhookQueue } from "./queue";
import { createRoutes } from "./routes";
import { handleScheduled } from "./scheduled";
import type { WebhookJobQueue } from "./services/webhook-delivery.service";
import { createV1App } from "./v1";

const trustedOrigins = [
	"http://localhost:5173",
	"https://react-hono-web.poco-ai.workers.dev",
];

const app = new Hono<{ Bindings: Env }>();

app.use(logger());
app.use(
	"/api/*",
	cors({
		origin: trustedOrigins,
		credentials: true,
		// CSV downloads expose the filename and truncation headers to the SPA.
		exposeHeaders: [
			"Content-Disposition",
			"X-Issue-Count",
			"X-Issue-Total",
			"X-Issue-Truncated",
		],
	}),
);
// MCP uses bearer tokens, never cookies: credentials must stay off so a
// browser cannot reuse an ambient session, and WWW-Authenticate is exposed so
// OAuth clients can read the RFC 9728 challenge.
app.use(
	"/mcp",
	cors({
		origin: trustedOrigins,
		credentials: false,
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Authorization",
			"Content-Type",
			"Accept",
			"Mcp-Protocol-Version",
			"Mcp-Session-Id",
			"Last-Event-ID",
		],
		exposeHeaders: [
			"WWW-Authenticate",
			"Mcp-Session-Id",
			"MCP-Protocol-Version",
		],
		maxAge: 86400,
	}),
);
// RFC 9728 / RFC 8414 discovery documents are served at the origin root.
app.use("/.well-known/*", cors({ origin: trustedOrigins, credentials: false }));

const stripeSetup = setupStripe({
	secretKey: env.STRIPE_SECRET_KEY,
	priceId: env.STRIPE_PRICE_ID,
	webhookSecret: env.STRIPE_WEBHOOK_SECRET,
});

const webhookQueue: WebhookJobQueue | null = env.WEBHOOK_QUEUE
	? {
			send: async (message) => {
				await env.WEBHOOK_QUEUE.send(message);
			},
		}
	: null;

const dependencies = createDependencies({
	db,
	storage: s3ClientFromEnv(),
	cache: createKvCache(env.KV),
	stripeSetup,
	billingMockEnabled: env.BILLING_MOCK_MODE === "true",
	webhookQueue,
	aiConfig: {
		AI_ENABLED: env.AI_ENABLED,
		AI_PROVIDER: env.AI_PROVIDER,
		AI_BASE_URL: env.AI_BASE_URL,
		AI_API_KEY: env.AI_API_KEY,
		AI_MODEL: env.AI_MODEL,
		AI_MODEL_ALLOWLIST: env.AI_MODEL_ALLOWLIST,
		AI_MAX_STEPS: env.AI_MAX_STEPS,
		AI_MAX_OUTPUT_TOKENS: env.AI_MAX_OUTPUT_TOKENS,
	},
	aiRateLimiters: {
		free: env.RATE_LIMITER_AI_FREE,
		pro: env.RATE_LIMITER_AI_PRO,
	},
	apiRateLimiters: {
		free: env.RATE_LIMITER_FREE,
		pro: env.RATE_LIMITER_PRO,
	},
	appWebUrl: env.APP_WEB_URL,
	resolvePublicApiUrl: (requestUrl) => {
		const configured =
			env.PUBLIC_API_URL?.trim() || env.BETTER_AUTH_URL?.trim();
		if (configured) return configured.replace(/\/+$/, "");
		return new URL(requestUrl).origin;
	},
});

const social: SocialProvidersConfig = {
	github: {
		clientId: env.GITHUB_CLIENT_ID ?? "",
		clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
	},
	google: {
		clientId: env.GOOGLE_CLIENT_ID ?? "",
		clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
	},
};

const mcpConfig = resolveMcpConfig({
	MCP_ENABLED: env.MCP_ENABLED,
	MCP_RESOURCE: env.MCP_RESOURCE,
	MCP_LOGIN_PAGE: env.MCP_LOGIN_PAGE,
	MCP_CONSENT_PAGE: env.MCP_CONSENT_PAGE,
	MCP_DCR_ENABLED: env.MCP_DCR_ENABLED,
	APP_WEB_URL: env.APP_WEB_URL,
	BETTER_AUTH_URL: env.BETTER_AUTH_URL,
});

const buildAuth = () =>
	createAuth({
		db,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins,
		policy: dependencies.services.authPolicyService,
		baseURL: env.BETTER_AUTH_URL,
		social,
		email: {
			resendApiKey: env.RESEND_API_KEY,
			from: env.EMAIL_FROM,
		},
		mcp: {
			enabled: mcpConfig.enabled,
			resource: mcpConfig.resource,
			loginPage: mcpConfig.loginPage,
			consentPage: mcpConfig.consentPage,
			dcrEnabled: mcpConfig.dcrEnabled,
			scopes: mcpConfig.oauthScopes,
		},
		onOrganizationCreated: (orgId) =>
			dependencies.services.statusService.ensureDefaultStatuses(orgId),
	});

/**
 * The MCP OAuth plugin seeds an oauthResource row during init. Cloudflare
 * Workers disallow D1 I/O while modules are evaluated, so the auth instance is
 * created on first use inside a request instead of at the top level.
 */
let authInstance: ReturnType<typeof buildAuth> | undefined;
const getAuth = () => {
	authInstance ??= buildAuth();
	return authInstance;
};
const auth = new Proxy({} as ReturnType<typeof buildAuth>, {
	get(_target, property) {
		const instance = getAuth();
		const value = Reflect.get(instance, property);
		return typeof value === "function" ? value.bind(instance) : value;
	},
});

app.route("/", createRoutes({ auth, dependencies, social, mcp: mcpConfig }));
app.route("/api/v1", createV1App(dependencies));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
// MCP clients follow the resource_metadata challenge to the origin root for
// protected-resource metadata, and read authorization-server metadata from
// the same place. The better-auth router dispatches these by full pathname.
app.on(["GET", "HEAD"], "/.well-known/*", (c) => auth.handler(c.req.raw));
app.all("/mcp", createMcpEndpoint({ auth, dependencies, config: mcpConfig }));

const stripeController = createStripeController({
	service: dependencies.services.billingService,
	stripeSetup,
});
app.post("/api/stripe/webhook", (c) => stripeController.webhook(c));

app.notFound((c) => fail(c, ApiErrorCode.NOT_FOUND, "Route not found", 404));

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

export default {
	fetch: app.fetch,
	queue: (batch: MessageBatch<{ deliveryId: string }>) =>
		handleWebhookQueue(batch, dependencies.services.webhookDeliveryService),
	scheduled: () =>
		handleScheduled(
			dependencies.services.cleanupService,
			dependencies.services.recurrenceService,
		),
};
