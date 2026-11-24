import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuth, createResetPasswordSender } from "../src/core/lib/auth";
import {
	enabledSocialProviders,
	type SocialProvidersConfig,
} from "../src/core/lib/social-providers";
import type { AuthPolicyService } from "../src/core/services/auth-policy.service";
import type { Database } from "../src/db/types";

const authFor = (extra?: {
	baseURL?: string;
	social?: SocialProvidersConfig;
}) =>
	createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: ["http://localhost:5173"],
		policy: {
			promoteFirstAdmin: async () => {},
		} as unknown as AuthPolicyService,
		...extra,
	});

test("password reset links are only logged when insecure logging is enabled", async () => {
	const logged: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		logged.push(args.join(" "));
	};
	try {
		await createResetPasswordSender({ allowInsecureLogging: true })({
			user: { email: "person@example.com" },
			url: "http://localhost:8787/api/auth/reset-password/token?callbackURL=http%3A%2F%2Flocalhost%3A5173%2Freset-password",
		});
	} finally {
		console.log = original;
	}
	assert.equal(logged.length, 2);
	assert.match(logged[0], /person@example\.com/);
	assert.match(logged[0], /reset-password\/token/);
	assert.match(logged[1], /never enable it in production/i);

	await assert.rejects(
		createResetPasswordSender({ allowInsecureLogging: false })({
			user: { email: "person@example.com" },
			url: "http://localhost:8787/api/auth/reset-password/token",
		}),
		/not configured/i,
	);
});

test("user creation keeps email unverified and delegates first-admin promotion", async () => {
	const promoted: string[] = [];
	const auth = createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: [],
		policy: {
			promoteFirstAdmin: async (id: string) => {
				promoted.push(id);
			},
		} as unknown as AuthPolicyService,
	});
	assert.equal(
		(
			auth.options.databaseHooks?.user?.create as
				| { before?: unknown }
				| undefined
		)?.before,
		undefined,
	);
	const after = auth.options.databaseHooks?.user?.create?.after;
	assert.ok(after);
	await after({ id: "user" } as unknown as Parameters<typeof after>[0]);
	assert.deepEqual(promoted, ["user"]);
});

test("password reset sending stays wired into the auth options", () => {
	const auth = authFor();
	assert.equal(
		typeof auth.options.emailAndPassword?.sendResetPassword,
		"function",
	);
});

test("email OTP sign-in is registered for passwordless login", () => {
	const auth = authFor();
	assert.ok(
		auth.options.plugins?.some((plugin) => plugin.id === "email-otp"),
		"email-otp plugin should be registered",
	);
	assert.equal(
		typeof auth.api.sendVerificationOTP,
		"function",
		"OTP endpoint should be exposed",
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

test("admin endpoint hooks invoke policy before role and ban writes", async () => {
	const calls: unknown[][] = [];
	const auth = createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: [],
		policy: {
			assertAdminUserMutation: async (...args: unknown[]) => {
				calls.push(args);
			},
		} as unknown as AuthPolicyService,
	});
	const hook = auth.options.hooks?.before;
	assert.ok(hook);
	for (const path of ["/admin/set-role", "/admin/ban-user"]) {
		await hook({
			path,
			body: { userId: "target" },
			context: { session: { user: { id: "actor" } } },
		} as unknown as Parameters<typeof hook>[0]);
	}
	await hook({
		path: "/admin/update-user",
		body: { userId: "target", data: { role: "admin" } },
		context: { session: { user: { id: "actor" } } },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/admin/update-user",
		body: { userId: "target", data: { banned: true } },
		context: { session: { user: { id: "actor" } } },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/admin/update-user",
		body: { userId: "target", data: { banned: false } },
		context: { session: { user: { id: "actor" } } },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/admin/remove-user",
		body: { userId: "target" },
		context: { session: { user: { id: "actor" } } },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/admin/set-user-password",
		body: { userId: "target" },
		context: { session: { user: { id: "actor" } } },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/admin/impersonate-user",
		body: { userId: "target" },
		context: { session: { user: { id: "actor" } } },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/admin/revoke-user-sessions",
		body: { userId: "target" },
		context: { session: { user: { id: "actor" } } },
	} as unknown as Parameters<typeof hook>[0]);
	assert.deepEqual(calls, [
		["actor", "target", "set-role"],
		["actor", "target", "ban-user"],
		["actor", "target", "set-role"],
		["actor", "target", "ban-user"],
		["actor", "target", "remove-user"],
		["actor", "target", "set-password"],
		["actor", "target", "impersonate"],
		["actor", "target", "revoke-sessions"],
	]);
});

test("organization mutation hooks enforce the billing freeze", async () => {
	const calls: unknown[][] = [];
	const auth = createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: [],
		policy: {
			assertOrgNotFrozen: async (orgId: string) => {
				calls.push(["org", orgId]);
			},
			assertInvitationNotFrozen: async (invitationId?: string) => {
				calls.push(["invitation", invitationId]);
			},
			assertCanAcceptInvitation: async () => {},
		} as unknown as AuthPolicyService,
	});
	const hook = auth.options.hooks?.before;
	assert.ok(hook);
	const session = {
		user: { id: "actor" },
		session: { activeOrganizationId: "org-active" },
	};
	await hook({
		path: "/organization/update",
		body: { organizationId: "org-body" },
		context: { session },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/organization/update-team",
		body: { teamId: "team", data: { organizationId: "org-team" } },
		context: { session },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/organization/remove-member",
		body: { memberIdOrEmail: "member" },
		context: { session },
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/organization/accept-invitation",
		body: { invitationId: "invitation-1" },
		context: {
			session: { ...session, session: { activeOrganizationId: null } },
		},
	} as unknown as Parameters<typeof hook>[0]);
	await hook({
		path: "/organization/cancel-invitation",
		body: { invitationId: "invitation-2" },
		context: {
			session: { ...session, session: { activeOrganizationId: null } },
		},
	} as unknown as Parameters<typeof hook>[0]);
	assert.deepEqual(calls, [
		["org", "org-body"],
		["org", "org-team"],
		["org", "org-active"],
		["invitation", "invitation-1"],
		["invitation", "invitation-2"],
	]);
});

test("email-dependent endpoints fail closed without a transport", async () => {
	const auth = createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: [],
		policy: {} as unknown as AuthPolicyService,
	});
	const hook = auth.options.hooks?.before;
	assert.ok(hook);
	for (const path of [
		"/email-otp/send-verification-otp",
		"/email-otp/request-password-reset",
		"/forget-password/email-otp",
		"/email-otp/request-email-change",
		"/request-password-reset",
		"/send-verification-email",
	]) {
		await assert.rejects(
			hook({
				path,
				body: {},
				context: {},
			} as unknown as Parameters<typeof hook>[0]),
			{ status: "SERVICE_UNAVAILABLE" },
		);
	}

	const localAuth = createAuth({
		db: {} as Database,
		secret: "test-secret",
		trustedOrigins: [],
		policy: {} as unknown as AuthPolicyService,
		allowInsecureLogging: true,
	});
	const localHook = localAuth.options.hooks?.before;
	assert.ok(localHook);
	await localHook({
		path: "/email-otp/send-verification-otp",
		body: {},
		context: {},
	} as unknown as Parameters<typeof localHook>[0]);
});
