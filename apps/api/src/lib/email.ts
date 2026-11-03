export type EmailOtpType =
	| "sign-in"
	| "email-verification"
	| "forget-password"
	| "change-email";

export type EmailDeliveryConfig = {
	resendApiKey?: string;
	from?: string;
};

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
}) {
	const { subject, purpose } = otpEmailContent[type];
	const text = `Your code to ${purpose} is ${otp}. It expires in ${expiresInMinutes} minutes. If you did not request this code, you can ignore this email.`;
	const html = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
  <p>Your code to ${purpose} is:</p>
  <p style="font-size: 32px; font-weight: 600; letter-spacing: 8px; margin: 24px 0;">${otp}</p>
  <p>This code expires in ${expiresInMinutes} minutes. If you did not request it, you can ignore this email.</p>
</div>`;

	return { subject, text, html };
}

/**
 * Delivers a one-time code through Resend. Set both config values or neither:
 * when neither is set the code is written to the Worker console instead,
 * mirroring the password reset fallback so local development works without an
 * email provider. A partial config fails loudly.
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
	const apiKey = config.resendApiKey?.trim();
	const from = config.from?.trim();
	if (!apiKey && !from) {
		console.log(`[auth] Email OTP (${type}) for ${to}: ${otp}`);
		console.log(
			"[auth] Resend is not configured - deliver this code to the user by email in production.",
		);
		return;
	}
	if (!apiKey || !from) {
		throw new Error(
			"Email OTP delivery is misconfigured: set both RESEND_API_KEY and EMAIL_FROM.",
		);
	}

	const { subject, text, html } = buildOtpEmail({
		otp,
		type,
		expiresInMinutes: Math.max(1, Math.round(expiresInSeconds / 60)),
	});
	const response = await fetchImpl("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ from, to: [to], subject, text, html }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Resend email delivery failed (${response.status})${body ? `: ${body}` : ""}`,
		);
	}
};
