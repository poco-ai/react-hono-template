import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { s3ClientFromConfig } from "../src/lib/storage/s3-client";

test("S3 signs the browser endpoint but uses the internal endpoint for HEAD", async () => {
	const requests: { method?: string; url?: string }[] = [];
	const server = createServer((req, res) => {
		requests.push({ method: req.method, url: req.url });
		res.writeHead(200, { "content-length": 4, "content-type": "text/plain" });
		res.end();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const env = {
			S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
			S3_BUCKET: "files",
			S3_REGION: "us-east-1",
			S3_ACCESS_KEY_ID: "test-key",
			S3_SECRET_ACCESS_KEY: "test-secret",
		};
		const storage = s3ClientFromConfig({
			...env,
			S3_SIGNING_ENDPOINT: "https://storage.example.test/",
		});
		assert.ok(storage);
		const key = "org/a b.txt";
		const put = new URL(await storage.presignPut(key, "text/plain", 60, 4));
		const get = new URL(await storage.presignGet(key, 60));
		for (const url of [put, get]) {
			assert.equal(url.origin, "https://storage.example.test");
			assert.equal(url.pathname, "/files/org/a%20b.txt");
			assert.ok(url.searchParams.has("X-Amz-Signature"));
		}
		assert.equal(
			put.searchParams.get("X-Amz-SignedHeaders"),
			"content-length;content-type;host",
		);
		assert.deepEqual(await storage.stat(key), {
			size: 4,
			contentType: "text/plain",
		});
		assert.deepEqual(requests, [
			{ method: "HEAD", url: "/files/org/a%20b.txt" },
		]);

		const singleEndpoint = s3ClientFromConfig(env);
		assert.ok(singleEndpoint);
		assert.equal(
			new URL(await singleEndpoint.presignGet(key, 60)).origin,
			env.S3_ENDPOINT,
		);
	} finally {
		server.close();
	}
});
