import {
	authMutationKeys,
	authQueryKeys,
	getAuthErrorCode,
	getAuthErrorMessage,
	getAuthErrorPresentation,
	isPasswordCompromisedError,
} from "@better-auth-ui/core";
import { oneTapMutationKeys } from "@better-auth-ui/core/plugins/one-tap";
import { useAuth } from "@better-auth-ui/react";
import {
	matchMutation,
	matchQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	inviteFailureMessage,
	isOrganizationQuotaError,
	organizationActionMessage,
} from "@/lib/auth/organization-errors";

function localizedAuthToast(
	t: ReturnType<typeof useTranslation>["t"],
	error: unknown,
	raw: string,
	mutationKey: readonly unknown[] | undefined,
) {
	const isAccept =
		mutationKey?.[0] === "auth" &&
		mutationKey[1] === "organization" &&
		mutationKey[2] === "acceptInvitation";
	if (isAccept) return inviteFailureMessage(t, error);
	if (
		mutationKey?.[0] === "auth" &&
		mutationKey[1] === "organization" &&
		(isOrganizationQuotaError(error) ||
			getAuthErrorCode(error) === "ORG_FROZEN" ||
			getAuthErrorCode(error) === "ORGANIZATION_SLUG_ALREADY_TAKEN" ||
			getAuthErrorCode(error) === "ORGANIZATION_ALREADY_EXISTS")
	) {
		return organizationActionMessage(t, error);
	}
	if (isOrganizationQuotaError(error)) {
		return t("errors.codes.PLAN_LIMIT_EXCEEDED");
	}
	return raw;
}

/** Localizes Better Auth UI error toasts without letting views own the cache. */
export function useAuthErrorToasts() {
	const { localization } = useAuth();
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	useEffect(() => {
		const queryCache = queryClient.getQueryCache();
		const previousQueryOnError = queryCache.config.onError;

		queryCache.config.onError = (error, query) => {
			previousQueryOnError?.(error, query);

			if (!matchQuery({ queryKey: authQueryKeys.all }, query)) return;
			if (getAuthErrorPresentation(query.meta) !== "toast") return;

			if (getAuthErrorCode(error) === "EMAIL_NOT_VERIFIED") return;
			const message = getAuthErrorMessage(error, localization);
			if (message) {
				console.error("[Better Auth UI]", error);
				toast.error(message);
			}
		};

		const mutationCache = queryClient.getMutationCache();
		const previousMutationOnError = mutationCache.config.onError;

		mutationCache.config.onError = (
			error,
			variables,
			onMutateResult,
			mutation,
			context,
		) => {
			previousMutationOnError?.(
				error,
				variables,
				onMutateResult,
				mutation,
				context,
			);

			if (!matchMutation({ mutationKey: authMutationKeys.all }, mutation)) {
				return;
			}
			if (getAuthErrorPresentation(mutation.meta) !== "toast") return;
			// Every form that sets a new password renders this one against the
			// password field, so a toast would just repeat it.
			if (isPasswordCompromisedError(error)) return;

			const code = getAuthErrorCode(error);
			// Sign-up and reset-password render their own localized copy for these.
			if (
				code === "USER_ALREADY_EXISTS" ||
				code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
				(code === "INVALID_TOKEN" &&
					matchMutation(
						{ mutationKey: authMutationKeys.resetPassword },
						mutation,
					))
			) {
				return;
			}

			if (
				code === "EMAIL_NOT_VERIFIED" &&
				!matchMutation({ mutationKey: oneTapMutationKeys.prompt }, mutation)
			) {
				return;
			}
			const message = getAuthErrorMessage(
				error,
				localization,
				mutation.options.mutationKey,
			);
			if (message) {
				console.error("[Better Auth UI]", error);
				toast.error(
					localizedAuthToast(t, error, message, mutation.options.mutationKey),
				);
			}
		};

		return () => {
			queryCache.config.onError = previousQueryOnError;
			mutationCache.config.onError = previousMutationOnError;
		};
	}, [queryClient, localization, t]);
}
