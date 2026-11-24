import { ApiError, ApiErrorCode } from "@workspace/shared";

export type EmailOtpType =
	| "sign-in"
	| "email-verification"
	| "forget-password"
	| "change-email";

export type EmailDeliveryConfig = {
	resendApiKey?: string;
	from?: string;
	/** Local-only: write codes and links to the Worker console without Resend. */
	allowInsecureLogging?: boolean;
};

type EmailMessage = { subject: string; text: string; html: string };

const otpEmailContent: Record<
	EmailOtpType,
	{ subject: string; purpose: string }
> = {
	"sign-in": { subject: "Your sign-in code", purpose: "sign in" },
	"email-verification": {
		subject: "Verify your email",
		purpose: "verify your email",
	},
	"forget-password": {
		subject: "Reset your password",
		purpose: "reset your password",
	},
	"change-email": {
		subject: "Confirm your new email",
		purpose: "confirm your new email address",
	},
};

export function buildOtpEmail({
	otp,
	type,
	expiresInMinutes,
}: {
	otp: string;
	type: EmailOtpType;
	expiresInMinutes: number;
}): EmailMessage {
	const { subject, purpose } = otpEmailContent[type];
	const text = `Your code to ${purpose} is ${otp}. It expires in ${expiresInMinutes} minutes. If you did not request this code, you can ignore this email.`;
	const html = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
  <p>Your code to ${purpose} is:</p>
  <p style="font-size: 32px; font-weight: 600; letter-spacing: 8px; margin: 24px 0;">${otp}</p>
  <p>This code expires in ${expiresInMinutes} minutes. If you did not request it, you can ignore this email.</p>
</div>`;

	return { subject, text, html };
}

export function buildVerificationEmail({ url }: { url: string }): EmailMessage {
	const text = `Verify your email address to finish setting up your account: ${url}`;
	const html = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
  <p>Verify your email address to finish setting up your account.</p>
  <p><a href="${url}">Verify email</a></p>
  <p>If you did not request this, you can ignore this email.</p>
</div>`;

	return { subject: "Verify your email", text, html };
}

export function buildPasswordResetEmail({
	url,
}: {
	url: string;
}): EmailMessage {
	const text = `Reset your password with this link: ${url}`;
	const html = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
  <p>Reset your password with this link:</p>
  <p><a href="${url}">Reset password</a></p>
  <p>If you did not request this, you can ignore this email.</p>
</div>`;

	return { subject: "Reset your password", text, html };
}

const credentialsFor = (config: EmailDeliveryConfig) => {
	const apiKey = config.resendApiKey?.trim();
	const from = config.from?.trim();
	if (!apiKey && !from) return null;
	if (!apiKey || !from) {
		throw new Error(
			"Email delivery is misconfigured: set both RESEND_API_KEY and EMAIL_FROM.",
		);
	}
	return { apiKey, from };
};

const logInsecureDelivery = (
	config: EmailDeliveryConfig,
	lines: readonly string[],
) => {
	if (!config.allowInsecureLogging) {
		throw new ApiError(
			ApiErrorCode.SERVICE_UNAVAILABLE,
			"Email delivery is not configured.",
		);
	}
	for (const line of lines) console.log(line);
	console.log(
		"[auth] Insecure logging is enabled for this environment - never enable it in production.",
	);
};

const postResendEmail = async (
	{ to, message }: { to: string; message: EmailMessage },
	{ apiKey, from }: { apiKey: string; from: string },
	fetchImpl: typeof fetch,
) => {
	const response = await fetchImpl("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: [to],
			subject: message.subject,
			text: message.text,
			html: message.html,
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Resend email delivery failed (${response.status})${body ? `: ${body}` : ""}`,
		);
	}
};

/**
 * Delivers a one-time code through Resend. Set both config values or neither.
 * Without a provider the code is only written to the Worker console when the
 * explicit local insecure-logging flag is set; otherwise delivery fails closed
 * so OTP codes never reach production logs. A partial config fails loudly.
 */
export const sendOtpEmail = async (
	{
		to,
		otp,
		type,
	}: {
		to: string;
		otp: string;
		type: EmailOtpType;
	},
	config: EmailDeliveryConfig,
	{
		expiresInSeconds = 300,
		fetchImpl = fetch,
	}: {
		expiresInSeconds?: number;
		fetchImpl?: typeof fetch;
	} = {},
) => {
	const credentials = credentialsFor(config);
	if (!credentials) {
		logInsecureDelivery(config, [
			`[auth] Email OTP (${type}) for ${to}: ${otp}`,
		]);
		return;
	}

	await postResendEmail(
		{
			to,
			message: buildOtpEmail({
				otp,
				type,
				expiresInMinutes: Math.max(1, Math.round(expiresInSeconds / 60)),
			}),
		},
		credentials,
		fetchImpl,
	);
};

/**
 * Sends the better-auth verification link through Resend. Falls back to the
 * explicit local console flag; production fails closed without a provider.
 */
export const sendVerificationEmail = async (
	{ to, url }: { to: string; url: string },
	config: EmailDeliveryConfig,
	{ fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
) => {
	const credentials = credentialsFor(config);
	if (!credentials) {
		logInsecureDelivery(config, [
			`[auth] Email verification link for ${to}: ${url}`,
		]);
		return;
	}

	await postResendEmail(
		{ to, message: buildVerificationEmail({ url }) },
		credentials,
		fetchImpl,
	);
};

/** Sends the password-reset link through Resend or the local console fallback. */
export const sendPasswordResetEmail = async (
	{ to, url }: { to: string; url: string },
	config: EmailDeliveryConfig,
	{ fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
) => {
	const credentials = credentialsFor(config);
	if (!credentials) {
		logInsecureDelivery(config, [
			`[auth] Password reset link for ${to}: ${url}`,
		]);
		return;
	}

	await postResendEmail(
		{ to, message: buildPasswordResetEmail({ url }) },
		credentials,
		fetchImpl,
	);
};
