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
import { handleWebhookQueue } from "./queue";
import { createRoutes } from "./routes";
import { handleScheduled } from "./scheduled";
import type { WebhookJobQueue } from "./services/webhook-delivery.service";
import { createV1App } from "./v1";

const trustedOrigins = [
	"http://localhost:5173",
	"https://react-hono-web.chenqiyuan1012.workers.dev",
];

const app = new Hono<{ Bindings: Env }>();

app.use(logger());
app.use("/api/*", cors({ origin: trustedOrigins, credentials: true }));

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

const auth = createAuth({
	db,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins,
	policy: dependencies.services.authPolicyService,
	baseURL: env.BETTER_AUTH_URL,
	social,
});

app.route("/", createRoutes({ auth, dependencies, social }));
app.route("/api/v1", createV1App(dependencies));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
	scheduled: () => handleScheduled(dependencies.services.cleanupService),
};
