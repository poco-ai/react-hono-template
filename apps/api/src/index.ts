import { env } from "cloudflare:workers";
import { ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createStripeController } from "./controllers/stripe.controller";
import { createMemberDao } from "./dao/member.dao";
import { createProjectDao } from "./dao/project.dao";
import { createSubscriptionDao } from "./dao/subscription.dao";
import { createWebhookDao } from "./dao/webhook.dao";
import { db } from "./db";
import { createAuth } from "./lib/auth";
import { fail } from "./lib/response";
import { s3ClientFromEnv } from "./lib/storage/s3-client";
import { createStripeContext } from "./lib/stripe";
import { createRoutes } from "./routes";
import { createBillingService } from "./services/billing.service";
import { createV1App } from "./v1";

const trustedOrigins = [
	"http://localhost:5173",
	"https://react-hono-web.chenqiyuan1012.workers.dev",
];

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors({ origin: trustedOrigins, credentials: true }));

const stripe = createStripeContext({
	secretKey: env.STRIPE_SECRET_KEY,
	priceId: env.STRIPE_PRICE_ID,
	webhookSecret: env.STRIPE_WEBHOOK_SECRET,
});

const auth = createAuth({
	db,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins,
});

app.route("/", createRoutes({ db, auth, storage: s3ClientFromEnv(), stripe }));
app.route("/api/v1", createV1App({ db }));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const stripeController = createStripeController({
	service: createBillingService({
		subscriptionDao: createSubscriptionDao(db),
		memberDao: createMemberDao(db),
		projectDao: createProjectDao(db),
		webhookDao: createWebhookDao(db),
		stripe,
	}),
	stripe,
});
app.post("/api/stripe/webhook", (c) => stripeController.webhook(c));

app.notFound((c) => fail(c, ApiErrorCode.NOT_FOUND, "Route not found", 404));

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

export default app;
