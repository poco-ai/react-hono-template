import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import {
	loadAppSession,
	refreshAppSession,
	type Session,
	sessionOptions,
} from "../src/features/auth/data";
import { sessionKey } from "../src/features/keys";
import { createAppRouter } from "../src/router";

const session = {
	session: { id: "session", expiresAt: "2100-01-01T00:00:00.000Z" },
	user: { id: "user", role: "admin" },
};
const lookupError = (status: number) =>
	Response.json(
		{ code: "FAILED_TO_GET_SESSION", message: "Could not get session" },
		{ status },
	);

async function withSessionResponse(
	respond: () => Response,
	run: () => Promise<void>,
) {
	const original = globalThis.fetch;
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL) => {
			const url = new URL(
				input instanceof Request ? input.url : String(input),
				"http://localhost",
			);
			assert.equal(url.pathname, "/api/auth/get-session");
			return respond();
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		await run();
	} finally {
		globalThis.fetch = original;
	}
}

function protectedRouter(queryClient: QueryClient) {
	const router = createAppRouter(queryClient);
	router.update({
		context: { queryClient },
		history: createMemoryHistory({ initialEntries: ["/account"] }),
	});
	return router;
}

test("no session and revoked sessions remain signed out", async () => {
	for (const respond of [() => Response.json(null), () => lookupError(401)]) {
		await withSessionResponse(respond, async () => {
			const client = new QueryClient();
			assert.equal(await client.fetchQuery(sessionOptions), null);
			assert.equal(client.getQueryData(sessionOptions.queryKey), null);
		});
	}
});

test("the protected route does not redirect on a session outage and can retry", async () => {
	let fail = true;
	let requests = 0;
	await withSessionResponse(
		() => {
			requests += 1;
			return fail ? lookupError(500) : Response.json(session);
		},
		async () => {
			const client = new QueryClient({
				defaultOptions: { queries: { retryDelay: 0 } },
			});
			const router = protectedRouter(client);
			await router.load();
			const guard = () =>
				router.state.matches.find(({ routeId }) => routeId === "/_auth");
			assert.equal(router.state.location.pathname, "/account");
			assert.equal(guard()?.status, "error");
			assert.match(String(guard()?.error), /Could not get session/);
			assert.equal(requests, 4);
			assert.equal(client.getQueryData(sessionOptions.queryKey), undefined);

			fail = false;
			await router.invalidate();
			assert.equal(guard()?.status, "success");
			const context = guard()?.context;
			assert.ok(context && "session" in context);
			assert.equal(context.session?.user.id, "user");
			assert.equal(requests, 5);
		},
	);
});

test("a failed explicit refresh rejects and the guard does not reuse the previous session", async () => {
	let status = 200;
	await withSessionResponse(
		() => (status === 200 ? Response.json(session) : lookupError(status)),
		async () => {
			const client = new QueryClient({
				defaultOptions: { queries: { retryDelay: 0 } },
			});
			await client.fetchQuery(sessionOptions);
			status = 500;
			await assert.rejects(refreshAppSession(client), { status: 500 });

			const router = protectedRouter(client);
			await router.load();
			assert.equal(
				router.state.matches.find(({ routeId }) => routeId === "/_auth")
					?.status,
				"error",
			);
			status = 401;
			await refreshAppSession(client);
			assert.equal(client.getQueryData(sessionOptions.queryKey), null);
		},
	);
});

test("unexpected client errors are neither retried nor cached as signed out", async () => {
	let requests = 0;
	await withSessionResponse(
		() => {
			requests += 1;
			return lookupError(403);
		},
		async () => {
			const client = new QueryClient();
			await assert.rejects(loadAppSession(client), { status: 403 });
			assert.equal(requests, 1);
			assert.equal(client.getQueryData(sessionOptions.queryKey), undefined);
		},
	);
});

test("network failures and malformed success responses are not signed-out results", async () => {
	for (const respond of [
		() => {
			throw new TypeError("Connection failed");
		},
		() => Response.json({}),
	]) {
		await withSessionResponse(respond, async () => {
			const client = new QueryClient({
				defaultOptions: { queries: { retryDelay: 0 } },
			});
			await assert.rejects(
				loadAppSession(client),
				/Connection failed|Invalid session response/,
			);
			assert.equal(client.getQueryData(sessionOptions.queryKey), undefined);
		});
	}
});

test("the guard loader rechecks a cached session after its local expiry", async () => {
	let requests = 0;
	await withSessionResponse(
		() => Response.json(++requests === 1 ? session : null),
		async () => {
			const client = new QueryClient();
			const initial = await client.fetchQuery(sessionOptions);
			assert.ok(initial);
			client.setQueryData<Session>(sessionKey(), {
				...initial,
				session: { ...initial.session, expiresAt: new Date(0) },
			});
			assert.equal(await loadAppSession(client), null);
			assert.equal(requests, 2);
		},
	);
});
