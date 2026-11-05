import assert from "node:assert/strict";
import { test } from "node:test";
import {
	signLegacyPayload,
	signStandardWebhook,
	verifyStandardWebhook,
} from "../src/lib/webhook-signature";

const secret = "shh";
const payload = '{"a":1}';
const id = "del-1";
const timestamp = 1700000000;

test("signLegacyPayload returns a hex HMAC-SHA256 over the payload", async () => {
	const signature = await signLegacyPayload("hello", "secret");
	assert.equal(
		signature,
		"88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b",
	);
	assert.equal(await signLegacyPayload("hello", "secret"), signature);
	assert.notEqual(await signLegacyPayload("hello!", "secret"), signature);
});

test("signStandardWebhook returns a v1 base64 HMAC over id.timestamp.payload", async () => {
	const signature = await signStandardWebhook({
		id,
		timestamp,
		payload,
		secret,
	});
	assert.equal(signature, "v1,k9RCTQB4Jc9Mzag1enZmVT30PIlUvMILpose0cO+YBk=");
	assert.equal(
		await signStandardWebhook({ id, timestamp, payload, secret }),
		signature,
	);
	assert.match(signature.split(",")[1] ?? "", /^[A-Za-z0-9+/]+={0,2}$/);
});

test("verifyStandardWebhook accepts a matching signature and number timestamps", async () => {
	const signature = await signStandardWebhook({
		id,
		timestamp,
		payload,
		secret,
	});
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp,
			payload,
			signature,
			secret,
			nowSeconds: timestamp,
		}),
		true,
	);
	// The header carries the timestamp as a string; the HMAC input must match.
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp: String(timestamp),
			payload,
			signature,
			secret,
			nowSeconds: timestamp,
		}),
		true,
	);
});

test("verifyStandardWebhook accepts any matching signature in the header", async () => {
	const signature = await signStandardWebhook({
		id,
		timestamp,
		payload,
		secret,
	});
	for (const header of [
		`v1,bm90LXRoZS1zaWduYXR1cmU= ${signature}`,
		`v1,bm90LXRoZS1zaWduYXR1cmU=,${signature}`,
	]) {
		assert.equal(
			await verifyStandardWebhook({
				id,
				timestamp,
				payload,
				signature: header,
				secret,
				nowSeconds: timestamp,
			}),
			true,
		);
	}
});

test("verifyStandardWebhook rejects timestamps outside the tolerance", async () => {
	const signature = await signStandardWebhook({
		id,
		timestamp,
		payload,
		secret,
	});
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp,
			payload,
			signature,
			secret,
			toleranceSeconds: 300,
			nowSeconds: timestamp + 301,
		}),
		false,
	);
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp,
			payload,
			signature,
			secret,
			toleranceSeconds: 300,
			nowSeconds: timestamp - 301,
		}),
		false,
	);
	// Boundary and explicit tolerance are inclusive.
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp,
			payload,
			signature,
			secret,
			toleranceSeconds: 300,
			nowSeconds: timestamp + 300,
		}),
		true,
	);
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp,
			payload,
			signature,
			secret,
			toleranceSeconds: 10,
			nowSeconds: timestamp + 11,
		}),
		false,
	);
});

test("verifyStandardWebhook rejects tampered payloads", async () => {
	const signature = await signStandardWebhook({
		id,
		timestamp,
		payload,
		secret,
	});
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp,
			payload: '{"a":2}',
			signature,
			secret,
			nowSeconds: timestamp,
		}),
		false,
	);
	assert.equal(
		await verifyStandardWebhook({
			id: "del-2",
			timestamp,
			payload,
			signature,
			secret,
			nowSeconds: timestamp,
		}),
		false,
	);
	assert.equal(
		await verifyStandardWebhook({
			id,
			timestamp,
			payload,
			signature,
			secret: "other",
			nowSeconds: timestamp,
		}),
		false,
	);
});

test("verifyStandardWebhook returns false for malformed input without throwing", async () => {
	const signature = await signStandardWebhook({
		id,
		timestamp,
		payload,
		secret,
	});
	for (const bad of [
		{ signature: "" },
		{ signature: "v1," },
		{ signature: "v1" },
		{ signature: "v2,abc" },
		{ signature: signature.replace(/^v1,/, "") },
		{ timestamp: "not-a-number" },
		{ timestamp: "-1" },
		{ timestamp: "1.5" },
	]) {
		assert.equal(
			await verifyStandardWebhook({
				id,
				timestamp,
				payload,
				signature,
				secret,
				nowSeconds: timestamp,
				...bad,
			}),
			false,
		);
	}
});
