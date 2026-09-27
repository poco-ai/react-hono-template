import { env } from "cloudflare:workers";
import { ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db";
import { createAuth } from "./lib/auth";
import { fail } from "./lib/response";
import { createRoutes } from "./routes";

const trustedOrigins = [
	"http://localhost:5173",
	"https://react-hono-web.chenqiyuan1012.workers.dev",
];

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors({ origin: trustedOrigins, credentials: true }));

const auth = createAuth({
	db,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins,
});

app.route("/", createRoutes({ db, auth }));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.notFound((c) => fail(c, ApiErrorCode.NOT_FOUND, "Route not found", 404));

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

export default app;
