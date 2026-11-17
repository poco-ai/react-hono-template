import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createApp } from "../src/app";
import { createRedisRateLimiter } from "../src/lib/redis/rate-limit";
import {
	createRedisWebhookQueue,
	drainWebhookQueue,
} from "../src/lib/redis/webhook-queue";
import { platformFromProcess } from "../src/platform/server";
import type { WebhookDeliveryService } from "../src/services/webhook-delivery.service";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const cookieJar = new Map<string, string>();

const rememberCookies = (response: Response) => {
	for (const cookie of response.headers.getSetCookie()) {
		const pair = cookie.split(";")[0] ?? "";
		const eq = pair.indexOf("=");
		if (eq > 0) cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1));
	}
};

const request = async (
	app: { fetch: (input: Request) => Promise<Response> | Response },
	path: string,
	init?: RequestInit,
) => {
	const headers = new Headers(init?.headers);
	headers.set("origin", "http://localhost:5173");
	if (cookieJar.size > 0) {
		headers.set(
			"cookie",
			[...cookieJar].map(([name, value]) => `${name}=${value}`).join("; "),
		);
	}
	const response = await app.fetch(
		new Request(`http://localhost:8787${path}`, { ...init, headers }),
	);
	rememberCookies(response);
	return response;
};

const jsonOrThrow = async (response: Response) => {
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`${response.status} ${response.url} ${text}`);
	}
	return text ? (JSON.parse(text) as Record<string, unknown>) : {};
};

const readId = (body: Record<string, unknown>, label: string) => {
	const nested = body.data;
	const org = body.organization;
	const id =
		(typeof body.id === "string" && body.id) ||
		(typeof org === "object" &&
			org !== null &&
			typeof (org as { id?: unknown }).id === "string" &&
			(org as { id: string }).id) ||
		(typeof nested === "object" &&
			nested !== null &&
			typeof (nested as { id?: unknown }).id === "string" &&
			(nested as { id: string }).id);
	if (!id)
		throw new Error(`${label} response has no id: ${JSON.stringify(body)}`);
	return id;
};

export const runSmoke = async () => {
	const databaseUrl = process.env.DATABASE_URL?.trim();
	const redisUrl = process.env.REDIS_URL?.trim();
	if (!databaseUrl || !redisUrl) {
		throw new Error("DATABASE_URL and REDIS_URL are required");
	}

	const sql = postgres(databaseUrl, { max: 1 });
	await migrate(drizzle({ client: sql }), {
		migrationsFolder: resolve(apiRoot, "drizzle-pg"),
	});
	await sql.unsafe(
		readFileSync(resolve(apiRoot, "drizzle-pg/fts/search_trgm.sql"), "utf8"),
	);
	await sql.end();

	const runtime = platformFromProcess(process.env);
	const { app } = createApp(runtime.platform);
	try {
		const hello = await request(app, "/");
		assert.equal(await hello.text(), "Hello Hono!");

		const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
		const signup = await jsonOrThrow(
			await request(app, "/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: `smoke-${id}@example.com`,
					password: "smoke-password-1",
					name: "Smoke",
				}),
			}),
		);
		assert.ok(signup.user || signup.token || cookieJar.size > 0);

		const orgBody = await jsonOrThrow(
			await request(app, "/api/auth/organization/create", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: `Smoke ${id}`, slug: `smoke${id}` }),
			}),
		);
		const orgId = readId(orgBody, "organization");

		const projectBody = await jsonOrThrow(
			await request(app, `/api/orgs/${orgId}/projects`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Smoke",
					key: id.slice(0, 4).toUpperCase(),
				}),
			}),
		);
		const project = projectBody.data as { id: string };
		assert.equal(typeof project?.id, "string");

		const title = `qx smoketoken ${id}`;
		await jsonOrThrow(
			await request(app, `/api/orgs/${orgId}/projects/${project.id}/issues`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ title }),
			}),
		);

		const longSearch = await jsonOrThrow(
			await request(
				app,
				`/api/orgs/${orgId}/search?q=${encodeURIComponent(`smoketoken ${id}`)}`,
			),
		);
		const shortSearch = await jsonOrThrow(
			await request(app, `/api/orgs/${orgId}/search?q=qx`),
		);
		const titles = (section: Record<string, unknown>) => {
			const data = section.data as
				| { issues?: { title?: string }[] }
				| undefined;
			return (data?.issues ?? []).map((issue) => issue.title);
		};
		assert.ok(titles(longSearch).includes(title));
		assert.ok(titles(shortSearch).includes(title));

		const limiter = createRedisRateLimiter(runtime.redis, 2, `smoke:${id}`);
		assert.equal((await limiter.limit({ key: id })).success, true);
		assert.equal((await limiter.limit({ key: id })).success, true);
		assert.equal((await limiter.limit({ key: id })).success, false);

		const seen: string[] = [];
		const deliveries = {
			deliverFromQueue: async (deliveryId: string) => {
				seen.push(deliveryId);
				return "success" as const;
			},
		} as unknown as WebhookDeliveryService;
		const deliveryId = `smoke-${id}`;
		await createRedisWebhookQueue(runtime.redis).send({ deliveryId });
		let consumed = false;
		for (let attempt = 0; attempt < 20 && !consumed; attempt += 1) {
			await drainWebhookQueue(runtime.redis, deliveries, { max: 20 });
			consumed = seen.includes(deliveryId);
		}
		assert.equal(consumed, true);
	} finally {
		await runtime.close();
	}
};
