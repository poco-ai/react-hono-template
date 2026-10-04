import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "../src/db/types";
import { createAuth, sendResetPasswordToConsole } from "../src/lib/auth";
import type { AuthPolicyService } from "../src/services/auth-policy.service";

const authFor = () =>
	createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: ["http://localhost:5173"],
		policy: {
			initialUserRole: async () => "user",
		} as unknown as AuthPolicyService,
	});

test("password reset links are written to the console instead of being emailed", async () => {
	const logged: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		logged.push(args.join(" "));
	};
	try {
		await sendResetPasswordToConsole({
			user: { email: "person@example.com" },
			url: "http://localhost:8787/api/auth/reset-password/token?callbackURL=http%3A%2F%2Flocalhost%3A5173%2Freset-password",
		});
	} finally {
		console.log = original;
	}
	assert.equal(logged.length, 2);
	assert.match(logged[0], /person@example\.com/);
	assert.match(logged[0], /reset-password\/token/);
	assert.match(logged[1], /email provider/i);
});

test("users are created as email-verified because the template cannot send verification mail", async () => {
	const auth = authFor();
	const before = auth.options.databaseHooks?.user?.create?.before;
	assert.ok(before);
	const result = await before({
		id: "user",
		createdAt: new Date(0),
		updatedAt: new Date(0),
		email: "person@example.com",
		emailVerified: false,
		name: "Person",
	});
	assert.equal(result?.data?.emailVerified, true);
	assert.equal(result?.data?.role, "user");
});

test("password reset sending stays wired into the auth options", () => {
	const auth = authFor();
	assert.equal(
		auth.options.emailAndPassword?.sendResetPassword,
		sendResetPasswordToConsole,
	);
});
