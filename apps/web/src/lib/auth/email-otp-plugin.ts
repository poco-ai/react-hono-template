import { createAuthPlugin } from "@better-auth-ui/core";
import {
	emailOtpPlugin as coreEmailOtpPlugin,
	type EmailOtpPluginOptions,
} from "@better-auth-ui/core/plugins/email-otp";

import { EmailOtp } from "@/components/auth/email-otp/email-otp";
import { EmailOtpButton } from "@/components/auth/email-otp/email-otp-button";

/**
 * Passwordless email-code sign-in for existing accounts. The other email-OTP
 * flows (verification, password reset, email change) stay on their link-based
 * implementations.
 */
export const emailOtpPlugin = createAuthPlugin(
	coreEmailOtpPlugin.id,
	(options: EmailOtpPluginOptions = {}) => {
		const core = coreEmailOtpPlugin(options);

		return {
			...core,
			authButtons: core.signIn ? [EmailOtpButton] : [],
			views: {
				auth: {
					...(core.signIn && { emailOtp: EmailOtp }),
				},
			},
			...(core.signIn && {
				fallbackViews: { auth: { signIn: EmailOtp } },
			}),
		};
	},
);
