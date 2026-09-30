import { env } from "cloudflare:workers";
import { ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createStripeController } from "./controllers/stripe.controller";
import { db } from "./db";
import { createDependencies } from "./dependencies";
import { createAuth } from "./lib/auth";
import { fail } from "./lib/response";
import { s3ClientFromEnv } from "./lib/storage/s3-client";
import { setupStripe } from "./lib/stripe";
import { createRoutes } from "./routes";
import { createV1App } from "./v1";

const trustedOrigins = [
	"http://localhost:5173",
	"https://react-hono-web.chenqiyuan1012.workers.dev",
];

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors({ origin: trustedOrigins, credentials: true }));

const stripeSetup = setupStripe({
	secretKey: env.STRIPE_SECRET_KEY,
	priceId: env.STRIPE_PRICE_ID,
	webhookSecret: env.STRIPE_WEBHOOK_SECRET,
});

const dependencies = createDependencies({
	db,
	storage: s3ClientFromEnv(),
	stripeSetup,
	billingMockEnabled: env.BILLING_MOCK_MODE === "true",
});

const auth = createAuth({
	db,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins,
	policy: dependencies.services.authPolicyService,
});

app.route("/", createRoutes({ auth, dependencies }));
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

export default app;
