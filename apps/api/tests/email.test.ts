import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildOtpEmail,
	buildPasswordResetEmail,
	buildVerificationEmail,
	type EmailDeliveryConfig,
	sendOtpEmail,
	sendPasswordResetEmail,
	sendVerificationEmail,
} from "../src/lib/email";

test("sign-in OTP emails contain the code and expiry", () => {
	const email = buildOtpEmail({
		otp: "123456",
		type: "sign-in",
		expiresInMinutes: 5,
	});

	assert.equal(email.subject, "Your sign-in code");
	assert.match(email.text, /123456/);
	assert.match(email.text, /5 minutes/);
	assert.match(email.html, /123456/);
});

test("sendOtpEmail posts the code to Resend", async () => {
	let captured: { url: string; init: RequestInit } | undefined;
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		captured = { url: String(input), init: init ?? {} };
		return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
	}) as typeof fetch;

	await sendOtpEmail(
		{ to: "person@example.com", otp: "654321", type: "sign-in" },
		{ resendApiKey: "re_test", from: "Acme <no-reply@example.com>" },
		{ fetchImpl },
	);

	assert.ok(captured);
	assert.equal(captured.url, "https://api.resend.com/emails");
	assert.equal(
		new Headers(captured.init.headers).get("authorization"),
		"Bearer re_test",
	);
	const body = JSON.parse(String(captured.init.body)) as {
		from: string;
		to: string[];
		subject: string;
		text: string;
	};
	assert.equal(body.from, "Acme <no-reply@example.com>");
	assert.deepEqual(body.to, ["person@example.com"]);
	assert.equal(body.subject, "Your sign-in code");
	assert.match(body.text, /654321/);
});

test("sendOtpEmail logs to the console only with the insecure local flag", async () => {
	const logged: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		logged.push(args.join(" "));
	};
	try {
		await sendOtpEmail(
			{ to: "person@example.com", otp: "111111", type: "sign-in" },
			{ allowInsecureLogging: true } satisfies EmailDeliveryConfig,
		);
	} finally {
		console.log = original;
	}

	assert.ok(logged.some((line) => line.includes("111111")));
	assert.ok(logged.some((line) => /never enable it in production/i.test(line)));

	await assert.rejects(
		sendOtpEmail(
			{ to: "person@example.com", otp: "444444", type: "sign-in" },
			{} satisfies EmailDeliveryConfig,
		),
		/not configured/i,
	);
});

test("password reset emails use Resend when configured and fail closed otherwise", async () => {
	const url =
		"https://api.example.com/api/auth/reset-password/token?callbackURL=/reset-password";
	const built = buildPasswordResetEmail({ url });
	assert.match(built.text, /reset-password/);

	let captured: { url: string; init: RequestInit } | undefined;
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		captured = { url: String(input), init: init ?? {} };
		return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
	}) as typeof fetch;

	await sendPasswordResetEmail(
		{ to: "person@example.com", url },
		{ resendApiKey: "re_test", from: "Acme <no-reply@example.com>" },
		{ fetchImpl },
	);

	assert.ok(captured);
	assert.equal(captured.url, "https://api.resend.com/emails");
	const body = JSON.parse(String(captured.init.body)) as {
		to: string[];
		subject: string;
		text: string;
	};
	assert.deepEqual(body.to, ["person@example.com"]);
	assert.equal(body.subject, "Reset your password");
	assert.match(body.text, /reset-password/);

	await assert.rejects(
		sendPasswordResetEmail(
			{ to: "person@example.com", url },
			{ allowInsecureLogging: false },
		),
		/not configured/i,
	);
});

test("sendOtpEmail rejects partial Resend config", async () => {
	await assert.rejects(
		sendOtpEmail(
			{ to: "person@example.com", otp: "333333", type: "sign-in" },
			{ resendApiKey: "re_test" },
		),
		/misconfigured/,
	);
});

test("verification emails carry the link and use the same Resend transport", async () => {
	const url = "https://api.example.com/api/auth/verify-email?token=abc";
	const built = buildVerificationEmail({ url });
	assert.match(built.text, /token=abc/);
	assert.match(built.html, /token=abc/);

	let captured: { url: string; init: RequestInit } | undefined;
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		captured = { url: String(input), init: init ?? {} };
		return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
	}) as typeof fetch;

	await sendVerificationEmail(
		{ to: "person@example.com", url },
		{ resendApiKey: "re_test", from: "Acme <no-reply@example.com>" },
		{ fetchImpl },
	);

	assert.ok(captured);
	assert.equal(captured.url, "https://api.resend.com/emails");
	const body = JSON.parse(String(captured.init.body)) as {
		to: string[];
		subject: string;
		text: string;
	};
	assert.deepEqual(body.to, ["person@example.com"]);
	assert.equal(body.subject, "Verify your email");
	assert.match(body.text, /token=abc/);

	await assert.rejects(
		sendVerificationEmail(
			{ to: "person@example.com", url },
			{ allowInsecureLogging: false },
		),
		/not configured/i,
	);
});

test("sendOtpEmail surfaces Resend failures", async () => {
	const fetchImpl = (async () =>
		new Response("invalid api key", { status: 401 })) as typeof fetch;

	await assert.rejects(
		sendOtpEmail(
			{ to: "person@example.com", otp: "222222", type: "sign-in" },
			{ resendApiKey: "re_bad", from: "Acme <no-reply@example.com>" },
			{ fetchImpl },
		),
		/401/,
	);
});
