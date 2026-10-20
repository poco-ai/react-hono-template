import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "../src/db/types";
import { createAuth, sendResetPasswordToConsole } from "../src/lib/auth";
import {
	enabledSocialProviders,
	type SocialProvidersConfig,
} from "../src/lib/social-providers";
import type { AuthPolicyService } from "../src/services/auth-policy.service";

const authFor = (extra?: {
	baseURL?: string;
	social?: SocialProvidersConfig;
}) =>
	createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: ["http://localhost:5173"],
		policy: {
			initialUserRole: async () => "user",
		} as unknown as AuthPolicyService,
		...extra,
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

test("no social config leaves social providers unset", () => {
	const auth = authFor();
	assert.equal(auth.options.socialProviders, undefined);
	assert.deepEqual(enabledSocialProviders(undefined), []);
});

test("github credentials enable only github", () => {
	const social = {
		github: { clientId: "github-id", clientSecret: "github-secret" },
	};
	const auth = authFor({ social });
	assert.deepEqual(enabledSocialProviders(social), ["github"]);
	assert.deepEqual(auth.options.socialProviders, {
		github: { clientId: "github-id", clientSecret: "github-secret" },
	});
	assert.equal(
		auth.options.account?.accountLinking?.disableImplicitLinking,
		true,
	);
});

test("github and google credentials enable both providers", () => {
	const social = {
		github: { clientId: "github-id", clientSecret: "github-secret" },
		google: { clientId: "google-id", clientSecret: "google-secret" },
	};
	const auth = authFor({ social });
	assert.deepEqual(enabledSocialProviders(social), ["github", "google"]);
	assert.deepEqual(auth.options.socialProviders, {
		github: { clientId: "github-id", clientSecret: "github-secret" },
		google: { clientId: "google-id", clientSecret: "google-secret" },
	});
	assert.ok(auth.options.socialProviders?.github);
	assert.ok(auth.options.socialProviders?.google);
	assert.equal(
		auth.options.account?.accountLinking?.disableImplicitLinking,
		true,
	);
});

test("blank social credentials do not enable a provider", () => {
	const social = {
		github: { clientId: "", clientSecret: "github-secret" },
		google: { clientId: "google-id", clientSecret: "   " },
	};
	const auth = authFor({ social });
	assert.deepEqual(enabledSocialProviders(social), []);
	assert.equal(auth.options.socialProviders, undefined);
	assert.equal(auth.options.account?.accountLinking, undefined);
});

test("baseURL is set only when passed", () => {
	assert.equal(authFor().options.baseURL, undefined);
	assert.equal(
		authFor({ baseURL: "http://localhost:5173" }).options.baseURL,
		"http://localhost:5173",
	);
});
