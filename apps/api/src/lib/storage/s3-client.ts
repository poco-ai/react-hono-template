import { env } from "cloudflare:workers";
import { AwsClient } from "aws4fetch";
import type { StorageAdapter } from "./types";

export interface S3ClientOptions {
	accessKeyId: string;
	secretAccessKey: string;
	endpoint: string;
	region: string;
	bucket: string;
	publicBaseUrl?: string;
}

const trimSlashes = (value: string) => value.replace(/\/+$/, "");

const encodeKey = (key: string) =>
	key.split("/").map(encodeURIComponent).join("/");

export const createS3Client = (options: S3ClientOptions): StorageAdapter => {
	let aws: AwsClient | null = null;

	const client = () => {
		if (!aws) {
			const { accessKeyId, secretAccessKey, endpoint, bucket } = options;
			if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
				throw new Error(
					"S3 storage is not configured: set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
				);
			}
			aws = new AwsClient({
				accessKeyId,
				secretAccessKey,
				service: "s3",
				region: options.region,
			});
		}
		return aws;
	};

	const objectUrl = (key: string) =>
		`${trimSlashes(options.endpoint)}/${options.bucket}/${encodeKey(key)}`;

	return {
		presignPut: async (key, contentType, expiresIn) => {
			const url = new URL(objectUrl(key));
			url.searchParams.set("X-Amz-Expires", String(expiresIn));
			const signed = await client().sign(url.toString(), {
				method: "PUT",
				headers: { "Content-Type": contentType },
				aws: { signQuery: true, allHeaders: true },
			});
			return signed.url;
		},
		presignGet: async (key, expiresIn) => {
			const url = new URL(objectUrl(key));
			url.searchParams.set("X-Amz-Expires", String(expiresIn));
			const signed = await client().sign(url.toString(), {
				method: "GET",
				aws: { signQuery: true },
			});
			return signed.url;
		},
		stat: async (key) => {
			const res = await client().fetch(objectUrl(key), { method: "HEAD" });
			if (res.status === 404) {
				return null;
			}
			if (!res.ok) {
				throw new Error(`S3 HEAD ${key} failed with status ${res.status}`);
			}
			return {
				size: Number(res.headers.get("content-length") ?? 0),
				contentType: res.headers.get("content-type"),
			};
		},
		remove: async (key) => {
			const res = await client().fetch(objectUrl(key), { method: "DELETE" });
			if (!res.ok && res.status !== 404) {
				throw new Error(`S3 DELETE ${key} failed with status ${res.status}`);
			}
		},
		publicUrl: (key) =>
			options.publicBaseUrl
				? `${trimSlashes(options.publicBaseUrl)}/${encodeKey(key)}`
				: null,
	};
};

export const s3ClientFromEnv = (): StorageAdapter | null => {
	if (
		!env.S3_ACCESS_KEY_ID ||
		!env.S3_SECRET_ACCESS_KEY ||
		!env.S3_ENDPOINT ||
		!env.S3_BUCKET
	) {
		return null;
	}
	return createS3Client({
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION || "auto",
		bucket: env.S3_BUCKET,
		publicBaseUrl: env.S3_PUBLIC_BASE_URL,
	});
};
