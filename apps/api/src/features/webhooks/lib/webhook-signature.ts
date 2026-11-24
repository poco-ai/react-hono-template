const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

// Workers (and Bun) provide btoa; the HMAC digest is 32 bytes so spreading is safe.
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const hmacSha256 = async (message: string, secret: string) => {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(message),
	);
	return new Uint8Array(signature);
};

/** Legacy signature: hex HMAC-SHA256 over the raw request body. */
export const signLegacyPayload = async (payload: string, secret: string) =>
	toHex(await hmacSha256(payload, secret));

export type SignStandardWebhookInput = {
	id: string;
	timestamp: number | string;
	payload: string;
	secret: string;
};

/**
 * Standard Webhooks signature: `v1,<base64>` over `${id}.${timestamp}.${payload}`.
 * The secret is used as the raw HMAC key (no `whsec_` prefix / base64 decoding).
 */
export const signStandardWebhook = async ({
	id,
	timestamp,
	payload,
	secret,
}: SignStandardWebhookInput) =>
	`v1,${toBase64(await hmacSha256(`${id}.${timestamp}.${payload}`, secret))}`;

export type VerifyStandardWebhookInput = {
	id: string;
	timestamp: number | string;
	payload: string;
	signature: string;
	secret: string;
	toleranceSeconds?: number;
	nowSeconds?: number;
};

const normalizeTimestamp = (
	timestamp: number | string,
): { seconds: number; value: string } | null => {
	const value =
		typeof timestamp === "number" ? String(timestamp) : timestamp.trim();
	if (!/^\d+$/.test(value)) {
		return null;
	}
	const seconds = Number(value);
	if (!Number.isSafeInteger(seconds)) {
		return null;
	}
	return { seconds, value };
};

// Accepts the v1 entries of a header such as `v1,abc v1,def` or `v1,abc,v1,def`.
const parseStandardSignatures = (header: string) => {
	const signatures: string[] = [];
	for (const token of header.trim().split(/\s+/)) {
		if (!token) {
			continue;
		}
		const parts = token.split(",");
		let index = 0;
		while (index < parts.length) {
			if (parts[index] === "v1" && index + 1 < parts.length) {
				const value = parts[index + 1].trim();
				if (value) {
					signatures.push(value);
				}
				index += 2;
			} else {
				index += 1;
			}
		}
	}
	return signatures;
};

const timingSafeEqual = (a: string, b: string) => {
	const length = Math.max(a.length, b.length);
	let diff = a.length ^ b.length;
	for (let index = 0; index < length; index++) {
		// charCodeAt is NaN past the end; `|| 0` keeps the loop branch-free.
		diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
	}
	return diff === 0;
};

/**
 * Verifies a Standard Webhooks `webhook-signature` header and its timestamp.
 * Returns false for malformed headers, expired/future timestamps or mismatches;
 * never throws.
 */
export const verifyStandardWebhook = async ({
	id,
	timestamp,
	payload,
	signature,
	secret,
	toleranceSeconds = 300,
	nowSeconds,
}: VerifyStandardWebhookInput): Promise<boolean> => {
	try {
		const parsed = normalizeTimestamp(timestamp);
		if (!parsed) {
			return false;
		}
		const now = nowSeconds ?? Math.floor(Date.now() / 1000);
		if (Math.abs(now - parsed.seconds) > toleranceSeconds) {
			return false;
		}
		const candidates = parseStandardSignatures(signature);
		if (candidates.length === 0) {
			return false;
		}
		const expected = toBase64(
			await hmacSha256(`${id}.${parsed.value}.${payload}`, secret),
		);
		return candidates.some((candidate) => timingSafeEqual(candidate, expected));
	} catch {
		return false;
	}
};
