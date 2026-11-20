import { handleWebhookQueue } from "../../queue";
import {
	WEBHOOK_MAX_ATTEMPTS,
	WEBHOOK_RETRY_DELAY_MS,
	type WebhookDeliveryService,
	type WebhookJobQueue,
} from "../../services/webhook-delivery.service";
import type { RedisLike } from "./client";

const READY_KEY = "webhook:ready";
const DELAYED_KEY = "webhook:delayed";
const PROCESSING_KEY = "webhook:processing";
const VISIBILITY_MS = 30_000;

type QueuedWebhook = {
	deliveryId: string;
	attempts: number;
	claimedAt?: number;
};

const encode = (job: QueuedWebhook) => JSON.stringify(job);

const decode = (raw: string): QueuedWebhook | null => {
	try {
		const parsed = JSON.parse(raw) as QueuedWebhook;
		if (!parsed?.deliveryId || !parsed.attempts) return null;
		return parsed;
	} catch {
		return null;
	}
};

export const createRedisWebhookQueue = (redis: RedisLike): WebhookJobQueue => ({
	send: async (message) => {
		await redis.lpush(
			READY_KEY,
			encode({ deliveryId: message.deliveryId, attempts: 1 }),
		);
	},
});

const promoteDelayed = async (redis: RedisLike) => {
	const due = await redis.zrangebyscore(DELAYED_KEY, 0, Date.now());
	for (const raw of due) {
		const removed = await redis.zrem(DELAYED_KEY, raw);
		if (removed === 1) await redis.lpush(READY_KEY, raw);
	}
};

const requeueStale = async (redis: RedisLike) => {
	const processing = await redis.hgetall(PROCESSING_KEY);
	const now = Date.now();
	for (const [deliveryId, raw] of Object.entries(processing)) {
		const job = decode(raw);
		if (!job || now - (job.claimedAt ?? 0) < VISIBILITY_MS) continue;
		const removed = await redis.hdel(PROCESSING_KEY, deliveryId);
		if (removed !== 1) continue;
		await redis.lpush(
			READY_KEY,
			encode({ deliveryId: job.deliveryId, attempts: job.attempts }),
		);
	}
};

const handleOne = async (
	redis: RedisLike,
	deliveries: WebhookDeliveryService,
	raw: string,
) => {
	const job = decode(raw);
	if (!job) return;
	await redis.hset(
		PROCESSING_KEY,
		job.deliveryId,
		encode({ ...job, claimedAt: Date.now() }),
	);
	const pending: Promise<unknown>[] = [];
	await handleWebhookQueue(
		{
			messages: [
				{
					body: { deliveryId: job.deliveryId },
					attempts: job.attempts,
					ack: () => {
						pending.push(redis.hdel(PROCESSING_KEY, job.deliveryId));
					},
					retry: () => {
						pending.push(
							(async () => {
								await redis.hdel(PROCESSING_KEY, job.deliveryId);
								if (job.attempts >= WEBHOOK_MAX_ATTEMPTS) return;
								await redis.zadd(
									DELAYED_KEY,
									Date.now() + WEBHOOK_RETRY_DELAY_MS,
									encode({
										deliveryId: job.deliveryId,
										attempts: job.attempts + 1,
									}),
								);
							})(),
						);
					},
				},
			],
		},
		deliveries,
	);
	await Promise.all(pending);
};

/** Pulls ready jobs and promotes delayed retries. */
export const drainWebhookQueue = async (
	redis: RedisLike,
	deliveries: WebhookDeliveryService,
	options?: { max?: number; shouldStop?: () => boolean },
) => {
	await promoteDelayed(redis);
	await requeueStale(redis);
	const max = options?.max ?? 10;
	let processed = 0;
	while (processed < max && !options?.shouldStop?.()) {
		const raw = await redis.rpop(READY_KEY);
		if (!raw) break;
		await handleOne(redis, deliveries, raw);
		processed += 1;
	}
	return processed;
};

export const startWebhookLoop = (
	redis: RedisLike,
	deliveries: WebhookDeliveryService,
	intervalMs = 500,
) => {
	let stopping = false;
	let activeDrain: Promise<void> | undefined;
	const tick = async () => {
		try {
			await drainWebhookQueue(redis, deliveries, {
				shouldStop: () => stopping,
			});
		} catch (error) {
			console.error("[webhook] redis consumer failed:", error);
		}
	};
	const timer = setInterval(() => {
		// A drained batch may include several slow HTTP deliveries. Do not
		// start a second consumer every time the poll interval elapses.
		if (stopping || activeDrain) return;
		activeDrain = tick().finally(() => {
			activeDrain = undefined;
		});
	}, intervalMs);
	return async () => {
		stopping = true;
		clearInterval(timer);
		await activeDrain;
	};
};
