import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebhookDao } from "../src/dao/webhook.dao";
import type {
	WebhookDeliveryAttemptPatch,
	WebhookDeliveryDao,
	WebhookDeliveryInsert,
} from "../src/dao/webhook-delivery.dao";
import type {
	WebhookDeliveryDto,
	WebhookWithSecretDto,
} from "../src/dto/webhook.dto";
import type { BackgroundFn } from "../src/lib/background";
import { handleWebhookQueue } from "../src/queue";
import {
	createWebhookDeliveryService,
	shouldRetryWebhookDelivery,
	WEBHOOK_MAX_ATTEMPTS,
	type WebhookJobQueue,
	type WebhookTarget,
} from "../src/services/webhook-delivery.service";

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
	payload: '{"id":"del-1"}',
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

test("retries while attempts are below the max and acks on the last attempt", () => {
	assert.equal(shouldRetryWebhookDelivery(1), true);
	assert.equal(shouldRetryWebhookDelivery(WEBHOOK_MAX_ATTEMPTS), false);
	assert.equal(shouldRetryWebhookDelivery(WEBHOOK_MAX_ATTEMPTS + 1), false);
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

const queueConsumer = ({
	delivery = deliveryDto(),
	hookRow = storedHook(),
}: {
	delivery?: WebhookDeliveryDto | null;
	hookRow?: WebhookWithSecretDto | null;
} = {}) => {
	const attempts: WebhookDeliveryAttemptPatch[] = [];
	const deliveryDao = {
		findByIdUnscoped: async (id: string) =>
			delivery && delivery.id === id ? delivery : null,
		recordAttempt: async (id: string, patch: WebhookDeliveryAttemptPatch) => {
			assert.equal(id, delivery?.id);
			attempts.push(patch);
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
	return { service, attempts };
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
	const { service, attempts } = queueConsumer();
	const { message, calls } = messageFor(1);
	try {
		await handleWebhookQueue({ messages: [message] }, service);
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0]?.status, "success");
		assert.equal(attempts[0]?.responseStatus, 204);
		assert.equal(attempts[0]?.lastError, null);
		assert.equal(attempts[0]?.attempts, 1);
		assert.deepEqual(calls, ["ack"]);
		const init = fetchMock.calls[0]?.init;
		const headers = new Headers(init?.headers);
		assert.equal(init?.method, "POST");
		assert.equal(init?.redirect, "manual");
		assert.equal(headers.get("content-type"), "application/json");
		assert.equal(headers.get("x-webhook-event"), "issue.created");
		assert.equal(headers.get("x-webhook-delivery"), "del-1");
		assert.match(headers.get("x-webhook-signature") ?? "", /^[0-9a-f]{64}$/);
		assert.equal(init?.body, deliveryDto().payload);
	} finally {
		fetchMock.restore();
	}
});

test("consumer records failed and retries a non-2xx attempt below the max", async () => {
	const fetchMock = installFetch(500);
	const { service, attempts } = queueConsumer();
	const { message, calls } = messageFor(1);
	try {
		await handleWebhookQueue({ messages: [message] }, service);
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

test("consumer leaves the row failed and acks the last attempt", async () => {
	const fetchMock = installFetch(500);
	const { service, attempts } = queueConsumer();
	const { message, calls } = messageFor(WEBHOOK_MAX_ATTEMPTS);
	try {
		await handleWebhookQueue({ messages: [message] }, service);
		assert.equal(attempts[0]?.status, "failed");
		assert.equal(attempts[0]?.lastError, "HTTP 500");
		assert.equal(attempts[0]?.attempts, WEBHOOK_MAX_ATTEMPTS);
		assert.deepEqual(calls, ["ack"]);
	} finally {
		fetchMock.restore();
	}
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
