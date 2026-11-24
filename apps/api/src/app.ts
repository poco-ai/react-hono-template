import { ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { composeModules } from "./core/compose";
import { createAuth } from "./core/lib/auth";
import type { BackgroundFn } from "./core/lib/background";
import { createErrorHandler } from "./core/lib/on-error";
import { runWithRequestMeta } from "./core/lib/request-context";
import { fail } from "./core/lib/response";
import type { AppPlatform } from "./core/platform/types";
import { FEATURE_MODULES } from "./manifest";
import { createRoutes } from "./routes";
import { handleScheduled } from "./scheduled";

const csvExposeHeaders = [
	"Content-Disposition",
	"X-Issue-Count",
	"X-Issue-Total",
	"X-Issue-Truncated",
];

export const createApp = (platform: AppPlatform) => {
	const app = new Hono();
	const composed = composeModules(platform, FEATURE_MODULES);
	const { dependencies } = composed;
	const mcpConfig = composed.mcpConfig as {
		enabled: boolean;
		resource?: string;
		loginPage?: string;
		consentPage?: string;
		dcrEnabled?: boolean;
		oauthScopes?: readonly string[];
	};

	const buildAuth = () =>
		createAuth({
			db: platform.db,
			secret: platform.authSecret,
			trustedOrigins: platform.trustedOrigins,
			policy: dependencies.services.authPolicyService,
			baseURL: platform.authBaseURL,
			social: platform.social,
			email: platform.email,
			dialect: platform.dialect,
			allowInsecureLogging: platform.allowInsecureLogging,
			mcp: mcpConfig.enabled
				? {
						enabled: true,
						resource: mcpConfig.resource ?? "",
						loginPage: mcpConfig.loginPage ?? "",
						consentPage: mcpConfig.consentPage ?? "",
						dcrEnabled: mcpConfig.dcrEnabled ?? false,
						scopes: mcpConfig.oauthScopes ?? [],
					}
				: undefined,
			// Organization-created hooks fold the feature contributions
			// (statuses seeds the default issue statuses).
			onOrganizationCreated: (orgId) =>
				runOrgCreatedHooks(composed.onOrgCreated, orgId),
			onMemberAudit: (event) =>
				dependencies.services.auditService.record({
					orgId: event.orgId,
					actorType: "user",
					actorId: event.actorId,
					action: event.action,
					targetType: event.targetType,
					targetId: event.targetId,
					before: event.before,
					after: event.after,
				}),
		});

	/**
	 * The MCP OAuth plugin seeds an oauthResource row during init. Cloudflare
	 * Workers disallow D1 I/O while modules are evaluated, so the auth instance
	 * is created on first use inside a request instead of at the top level.
	 * The long-running server uses the same lazy init.
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

	// Top-level error mapping: handlers mounted directly on this app (Stripe
	// webhook, /mcp, /api/auth/*) are outside the sub-apps and need the same
	// envelope guarantee as the main and v1 APIs.
	app.onError(createErrorHandler("worker"));
	app.use("*", async (c, next) => {
		const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
		await runWithRequestMeta(
			{
				requestId:
					c.req.header("cf-ray") ??
					c.req.header("x-request-id") ??
					crypto.randomUUID(),
				ipAddress: c.req.header("cf-connecting-ip") ?? forwarded ?? null,
				userAgent: c.req.header("user-agent") ?? null,
			},
			() => next(),
		);
	});
	app.use(logger());
	app.use(
		"/api/*",
		cors({
			origin: platform.trustedOrigins,
			credentials: true,
			exposeHeaders: csvExposeHeaders,
		}),
	);
	// MCP uses bearer tokens, never cookies: credentials must stay off so a
	// browser cannot reuse an ambient session, and WWW-Authenticate is exposed so
	// OAuth clients can read the RFC 9728 challenge.
	app.use(
		"/mcp",
		cors({
			origin: platform.trustedOrigins,
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
	app.use(
		"/.well-known/*",
		cors({ origin: platform.trustedOrigins, credentials: false }),
	);

	app.route(
		"/",
		createRoutes({
			auth,
			dependencies,
			social: platform.social,
			freezeWriteExempt: composed.freezeWriteExempt,
		}),
	);
	if (composed.v1App) {
		app.route("/api/v1", composed.v1App);
	}
	app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
	// MCP clients follow the resource_metadata challenge to the origin root for
	// protected-resource metadata, and read authorization-server metadata from
	// the same place. The better-auth router dispatches these by full pathname.
	app.on(["GET", "HEAD"], "/.well-known/*", (c) => auth.handler(c.req.raw));
	const mcpEndpoint = composed.mcpEndpoint as unknown as
		| ((auth: unknown) => (c: Context) => Response)
		| null;
	if (mcpEndpoint) {
		app.all("/mcp", mcpEndpoint(auth));
	}

	const stripeWebhook = composed.stripeWebhook;
	if (stripeWebhook) app.post("/api/stripe/webhook", stripeWebhook);
	app.notFound((c) => fail(c, ApiErrorCode.NOT_FOUND, "Route not found", 404));
	app.get("/", (c) => c.text("Hello Hono!"));

	const runScheduled = (background?: BackgroundFn) =>
		handleScheduled(composed.scheduledJobs, background);

	return {
		app,
		dependencies,
		getAuth,
		runScheduled,
		queueConsumers: composed.queueConsumers,
	};
};

const runOrgCreatedHooks = async (
	hooks: readonly ((orgId: string) => Promise<void>)[],
	orgId: string,
) => {
	for (const hook of hooks) {
		await hook(orgId);
	}
};
