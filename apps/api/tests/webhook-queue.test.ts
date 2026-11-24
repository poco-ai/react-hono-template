import assert from "node:assert/strict";
import { test } from "node:test";
import type { BackgroundFn } from "../src/core/lib/background";
import type { WebhookDao } from "../src/features/webhooks/dao/webhook.dao";
import type {
	WebhookDeliveryAttemptPatch,
	WebhookDeliveryDao,
	WebhookDeliveryInsert,
} from "../src/features/webhooks/dao/webhook-delivery.dao";
import type {
	WebhookDeliveryDto,
	WebhookWithSecretDto,
} from "../src/features/webhooks/dto/webhook.dto";
import {
	signLegacyPayload,
	verifyStandardWebhook,
} from "../src/features/webhooks/lib/webhook-signature";
import {
	createWebhookDeliveryService,
	WEBHOOK_MAX_ATTEMPTS,
	type WebhookDeliveryService,
	type WebhookJobQueue,
	type WebhookTarget,
} from "../src/features/webhooks/services/webhook-delivery.service";
import { handleWebhookQueue } from "../src/queue";

const hook: WebhookTarget = {
	id: "hook-1",
	url: "https://example.com/hook",
	secret: "shh",
};

const deliveryDto = (
	overrides: Partial<WebhookDeliveryDto> = {},
): WebhookDeliveryDto => ({
	id: "del-1",
	orgId: "org-1",
	webhookId: hook.id,
	event: "issue.created",
	payload: '{"event":"issue.created","id":"payload-1"}',
	status: "pending",
	attempts: 0,
	responseStatus: null,
	lastError: null,
	lastAttemptAt: null,
	createdAt: "2026-10-20T00:00:00.000Z",
	updatedAt: "2026-10-20T00:00:00.000Z",
	...overrides,
});

const storedHook = (): WebhookWithSecretDto => ({
	id: hook.id,
	orgId: "org-1",
	url: hook.url,
	secret: hook.secret,
	events: ["issue.created"],
	active: true,
	createdById: null,
	createdAt: "2026-10-20T00:00:00.000Z",
	updatedAt: "2026-10-20T00:00:00.000Z",
});

const installFetch = (status: number) => {
	const calls: { url: string; init?: RequestInit }[] = [];
	const previous = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		calls.push({ url, init });
		return new Response(null, { status });
	}) as typeof fetch;
	return {
		calls,
		restore: () => {
			globalThis.fetch = previous;
		},
	};
};

test("max attempts stays aligned with the queue retry budget", () => {
	// 1 initial delivery + max_retries (2); see wrangler.jsonc.
	assert.equal(WEBHOOK_MAX_ATTEMPTS, 3);
});

test("queue configured: enqueue writes the row and sends the delivery id without fetching", async () => {
	const fetchMock = installFetch(200);
	const created: WebhookDeliveryInsert[] = [];
	const sent: { deliveryId: string }[] = [];
	const order: string[] = [];
	let backgroundCalls = 0;
	const deliveryDao = {
		create: async (data: WebhookDeliveryInsert) => {
			order.push("create");
			created.push(data);
			return deliveryDto({
				id: data.id,
				payload: data.payload,
				event: data.event,
			});
		},
	} as unknown as WebhookDeliveryDao;
	const queue: WebhookJobQueue = {
		send: async (message) => {
			order.push("send");
			sent.push(message);
		},
	};
	const background: BackgroundFn = () => {
		backgroundCalls += 1;
	};
	try {
		const service = createWebhookDeliveryService({
			webhookDao: {} as WebhookDao,
			deliveryDao,
			queue,
		});
		await service.enqueue(hook, "org-1", "ping", { ping: true }, background);
		assert.deepEqual(order, ["create", "send"]);
		assert.equal(created.length, 1);
		assert.equal(created[0]?.status, "pending");
		assert.equal(created[0]?.orgId, "org-1");
		assert.equal(created[0]?.webhookId, hook.id);
		assert.deepEqual(sent, [{ deliveryId: created[0]?.id }]);
		assert.equal(backgroundCalls, 0);
		assert.equal(fetchMock.calls.length, 0);
	} finally {
		fetchMock.restore();
	}
});

test("queue send failure falls back to in-process delivery", async () => {
	const backgroundCalls: Array<() => Promise<void>> = [];
	const deliveryDao = {
		create: async (data: WebhookDeliveryInsert) =>
			deliveryDto({ id: data.id, payload: data.payload, event: data.event }),
	} as unknown as WebhookDeliveryDao;
	const queue: WebhookJobQueue = {
		send: async () => {
			throw new Error("queue down");
		},
	};
	const service = createWebhookDeliveryService({
		webhookDao: {} as WebhookDao,
		deliveryDao,
		queue,
	});
	await service.enqueue(hook, "org-1", "ping", { ping: true }, (fn) => {
		backgroundCalls.push(fn);
	});
	assert.equal(backgroundCalls.length, 1);
});

test("queue configured: redeliver resets the row then sends the delivery id", async () => {
	const order: string[] = [];
	const sent: { deliveryId: string }[] = [];
	const delivery = deliveryDto();
	const deliveryDao = {
		resetForRedelivery: async (orgId: string, id: string) => {
			order.push("reset");
			assert.equal(orgId, "org-1");
			assert.equal(id, delivery.id);
			return true;
		},
	} as unknown as WebhookDeliveryDao;
	const queue: WebhookJobQueue = {
		send: async (message) => {
			order.push("send");
			sent.push(message);
		},
	};
	const service = createWebhookDeliveryService({
		webhookDao: {} as WebhookDao,
		deliveryDao,
		queue,
	});
	await service.redeliver("org-1", delivery, hook, () => {
		throw new Error("background should not run when the queue is configured");
	});
	assert.deepEqual(order, ["reset", "send"]);
	assert.deepEqual(sent, [{ deliveryId: delivery.id }]);
});

test("queue absent: fallback invokes the background function and does not fetch until it runs", async () => {
	const fetchMock = installFetch(204);
	const attempts: WebhookDeliveryAttemptPatch[] = [];
	const tasks: Array<() => Promise<void>> = [];
	const deliveryDao = {
		create: async (data: WebhookDeliveryInsert) =>
			deliveryDto({ id: data.id, payload: data.payload, event: data.event }),
		claimAttempt: async () => true,
		recordAttempt: async (id: string, patch: WebhookDeliveryAttemptPatch) => {
			assert.equal(id.length > 0, true);
			attempts.push(patch);
		},
	} as unknown as WebhookDeliveryDao;
	try {
		const service = createWebhookDeliveryService({
			webhookDao: {} as WebhookDao,
			deliveryDao,
			queue: null,
		});
		await service.enqueue(hook, "org-1", "ping", { ping: true }, (fn) => {
			tasks.push(fn);
		});
		assert.equal(tasks.length, 1);
		assert.equal(fetchMock.calls.length, 0);
		await tasks[0]?.();
		assert.equal(fetchMock.calls.length, 1);
		assert.equal(attempts[0]?.status, "success");
		assert.equal(attempts[0]?.attempts, 1);
	} finally {
		fetchMock.restore();
	}
});

test("queue absent: a failing delivery posts once and records one failed attempt", async () => {
	const fetchMock = installFetch(500);
	const attempts: WebhookDeliveryAttemptPatch[] = [];
	const tasks: Array<() => Promise<void>> = [];
	const deliveryDao = {
		create: async (data: WebhookDeliveryInsert) =>
			deliveryDto({ id: data.id, payload: data.payload, event: data.event }),
		claimAttempt: async () => true,
		recordAttempt: async (id: string, patch: WebhookDeliveryAttemptPatch) => {
			assert.equal(id.length > 0, true);
			attempts.push(patch);
		},
	} as unknown as WebhookDeliveryDao;
	try {
		const service = createWebhookDeliveryService({
			webhookDao: {} as WebhookDao,
			deliveryDao,
			queue: null,
		});
		await service.enqueue(hook, "org-1", "ping", { ping: true }, (fn) => {
			tasks.push(fn);
		});
		await tasks[0]?.();
		// Retries are owned by Queues; the in-process fallback must not sleep
		// and POST a second time within the request.
		assert.equal(fetchMock.calls.length, 1);
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0]?.status, "failed");
		assert.equal(attempts[0]?.attempts, 1);
	} finally {
		fetchMock.restore();
	}
});

const queueConsumer = ({
	delivery = deliveryDto(),
	hookRow = storedHook(),
}: {
	delivery?: WebhookDeliveryDto | null;
	hookRow?: WebhookWithSecretDto | null;
} = {}) => {
	const attempts: WebhookDeliveryAttemptPatch[] = [];
	const claims: number[] = [];
	const deliveryDao = {
		findByIdUnscoped: async (id: string) =>
			delivery && delivery.id === id ? delivery : null,
		// Mirrors the DAO's conditional UPDATE; mutating the in-memory row lets
		// later messages observe the claim/record results.
		claimAttempt: async (id: string, attempt: number) => {
			if (!delivery || delivery.id !== id) return false;
			if (delivery.status === "success" || delivery.attempts >= attempt) {
				return false;
			}
			claims.push(attempt);
			delivery.attempts = attempt;
			delivery.status = "pending";
			return true;
		},
		recordAttempt: async (id: string, patch: WebhookDeliveryAttemptPatch) => {
			assert.equal(id, delivery?.id);
			attempts.push(patch);
			if (delivery) {
				delivery.attempts = patch.attempts;
				delivery.status = patch.status;
			}
		},
	} as unknown as WebhookDeliveryDao;
	const webhookDao = {
		findById: async (orgId: string, id: string) => {
			if (!hookRow || hookRow.id !== id || hookRow.orgId !== orgId) return null;
			return hookRow;
		},
	} as unknown as WebhookDao;
	const service = createWebhookDeliveryService({
		webhookDao,
		deliveryDao,
		queue: null,
	});
	return { service, attempts, claims };
};

const messageFor = (attempts: number) => {
	const calls: string[] = [];
	return {
		calls,
		message: {
			body: { deliveryId: "del-1" },
			attempts,
			ack: () => {
				calls.push("ack");
			},
			retry: () => {
				calls.push("retry");
			},
		},
	};
};

test("consumer records success and acks a 2xx attempt", async () => {
	const fetchMock = installFetch(204);
	const { service, attempts, claims } = queueConsumer();
	const { message, calls } = messageFor(1);
	try {
		await handleWebhookQueue({ messages: [message] }, service);
		assert.deepEqual(claims, [1]);
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0]?.status, "success");
		assert.equal(attempts[0]?.responseStatus, 204);
		assert.equal(attempts[0]?.lastError, null);
		assert.equal(attempts[0]?.attempts, 1);
		assert.deepEqual(calls, ["ack"]);
		const init = fetchMock.calls[0]?.init;
		const headers = new Headers(init?.headers);
		const payload = deliveryDto().payload;
		assert.equal(init?.method, "POST");
		assert.equal(init?.redirect, "manual");
		assert.equal(headers.get("content-type"), "application/json");
		assert.equal(headers.get("x-webhook-event"), "issue.created");
		assert.equal(headers.get("x-webhook-delivery"), "del-1");
		assert.equal(
			headers.get("x-webhook-signature"),
			await signLegacyPayload(payload, hook.secret),
		);

		const webhookId = headers.get("webhook-id");
		const webhookTimestamp = headers.get("webhook-timestamp");
		const webhookSignature = headers.get("webhook-signature");
		assert.equal(webhookId, "del-1");
		assert.match(webhookTimestamp ?? "", /^\d+$/);
		assert.match(webhookSignature ?? "", /^v1,/);
		assert.equal(
			await verifyStandardWebhook({
				id: webhookId ?? "",
				timestamp: webhookTimestamp ?? "",
				payload,
				signature: webhookSignature ?? "",
				secret: hook.secret,
				nowSeconds: Number(webhookTimestamp),
			}),
			true,
		);
		assert.equal(init?.body, payload);
	} finally {
		fetchMock.restore();
	}
});

test("consumer records failed and retries a non-2xx attempt below the max", async () => {
	const fetchMock = installFetch(500);
	const { service, attempts, claims } = queueConsumer();
	const { message, calls } = messageFor(1);
	try {
		await handleWebhookQueue({ messages: [message] }, service);
		assert.deepEqual(claims, [1]);
		assert.equal(attempts[0]?.status, "failed");
		assert.equal(attempts[0]?.responseStatus, 500);
		assert.equal(attempts[0]?.lastError, "HTTP 500");
		assert.equal(attempts[0]?.attempts, 1);
		assert.deepEqual(calls, ["retry"]);
		assert.equal(fetchMock.calls.length, 1);
	} finally {
		fetchMock.restore();
	}
});

test("consumer retries the last failed attempt so Queues dead-letters it", async () => {
	const fetchMock = installFetch(500);
	const { service, attempts } = queueConsumer();
	const { message, calls } = messageFor(WEBHOOK_MAX_ATTEMPTS);
	try {
		await handleWebhookQueue({ messages: [message] }, service);
		assert.equal(attempts[0]?.status, "failed");
		assert.equal(attempts[0]?.lastError, "HTTP 500");
		assert.equal(attempts[0]?.attempts, WEBHOOK_MAX_ATTEMPTS);
		// Acking would drop the failure; Queues routes the final retry to the DLQ.
		assert.deepEqual(calls, ["retry"]);
	} finally {
		fetchMock.restore();
	}
});

test("consumer retries when the delivery service throws", async () => {
	const service = {
		deliverFromQueue: async () => {
			throw new Error("boom");
		},
	} as unknown as WebhookDeliveryService;
	const { message, calls } = messageFor(2);
	await handleWebhookQueue({ messages: [message] }, service);
	assert.deepEqual(calls, ["retry"]);
});

test("consumer acks without fetching when the delivery or webhook is gone", async () => {
	const fetchMock = installFetch(200);
	try {
		const missingDelivery = queueConsumer({ delivery: null });
		const missingMessage = messageFor(1);
		await handleWebhookQueue(
			{ messages: [missingMessage.message] },
			missingDelivery.service,
		);
		assert.deepEqual(missingMessage.calls, ["ack"]);
		assert.equal(missingDelivery.attempts.length, 0);

		const missingHook = queueConsumer({ hookRow: null });
		const hookMessage = messageFor(1);
		await handleWebhookQueue(
			{ messages: [hookMessage.message] },
			missingHook.service,
		);
		assert.deepEqual(hookMessage.calls, ["ack"]);
		assert.equal(missingHook.attempts.length, 0);
		assert.equal(fetchMock.calls.length, 0);
	} finally {
		fetchMock.restore();
	}
});

test("consumer acks a duplicate without posting when the delivery already succeeded", async () => {
	const fetchMock = installFetch(200);
	const { service, attempts, claims } = queueConsumer({
		delivery: deliveryDto({ status: "success", attempts: 1 }),
	});
	// A later queue attempt would still lose the claim because status=success.
	const { message, calls } = messageFor(2);
	try {
		await handleWebhookQueue({ messages: [message] }, service);
		assert.deepEqual(claims, []);
		assert.equal(attempts.length, 0);
		assert.equal(fetchMock.calls.length, 0);
		assert.deepEqual(calls, ["ack"]);
	} finally {
		fetchMock.restore();
	}
});

test("consumer delivers a re-delivered message only once", async () => {
	const fetchMock = installFetch(204);
	const { service, attempts, claims } = queueConsumer();
	const first = messageFor(1);
	const duplicate = messageFor(1);
	try {
		await handleWebhookQueue(
			{ messages: [first.message, duplicate.message] },
			service,
		);
		// The second message loses the claim: no second POST, no retry.
		assert.deepEqual(claims, [1]);
		assert.equal(fetchMock.calls.length, 1);
		assert.equal(attempts.length, 1);
		assert.deepEqual(first.calls, ["ack"]);
		assert.deepEqual(duplicate.calls, ["ack"]);
	} finally {
		fetchMock.restore();
	}
});

test("dispatch is best-effort and isolates failing subscribers", async () => {
	const created: string[] = [];
	const deliveryDao = {
		create: async (data: WebhookDeliveryInsert) => {
			if (data.webhookId === "hook-bad") throw new Error("d1 down");
			created.push(data.webhookId);
			return deliveryDto({ id: data.id, webhookId: data.webhookId });
		},
	} as unknown as WebhookDeliveryDao;
	const webhookDao = {
		listByOrgAndEvent: async () => [hook, { ...hook, id: "hook-bad" }],
	} as unknown as WebhookDao;
	const service = createWebhookDeliveryService({ webhookDao, deliveryDao });
	const originalError = console.error;
	console.error = () => {};
	try {
		await service.dispatch("org-1", "issue.created", {});
	} finally {
		console.error = originalError;
	}
	assert.deepEqual(created, ["hook-1"]);
});
