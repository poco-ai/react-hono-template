import { getAuthErrorCode } from "@better-auth-ui/core";
import type { TFunction } from "i18next";
import { isPlanLimitError } from "@/lib/api";
import { apiErrorMessage, errorCode, type TranslationKey } from "@/lib/errors";

const INVITE_ERROR_KEYS = {
	INVITATION_NOT_FOUND: "invite.errors.invitationNotFound",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "invite.errors.emailMismatch",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "invite.errors.alreadyMember",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "invite.errors.orgFull",
	PLAN_LIMIT_EXCEEDED: "invite.errors.orgFull",
} as const satisfies Record<string, TranslationKey>;

function errorText(error: unknown): string {
	if (typeof error !== "object" || error === null) return "";
	const record = error as { message?: unknown; error?: unknown };
	const own = typeof record.message === "string" ? record.message : "";
	const nested =
		record.error && record.error !== error ? errorText(record.error) : "";
	return `${own} ${nested}`;
}

/** Plan-limit failures from better-auth, including when the code is FORBIDDEN. */
export function isOrganizationQuotaError(error: unknown): boolean {
	const code = getAuthErrorCode(error) ?? errorCode(error);
	if (code === "PLAN_LIMIT_EXCEEDED") return true;
	if (isPlanLimitError(error)) return true;
	return /plan limit reached|PLAN_LIMIT_EXCEEDED/i.test(errorText(error));
}

export function organizationActionMessage(
	t: TFunction,
	error: unknown,
	fallbackKey: TranslationKey = "errors.generic",
): string {
	const code = getAuthErrorCode(error) ?? errorCode(error);
	if (isOrganizationQuotaError(error)) {
		return t("errors.codes.PLAN_LIMIT_EXCEEDED");
	}
	if (
		code === "ORGANIZATION_SLUG_ALREADY_TAKEN" ||
		code === "ORGANIZATION_ALREADY_EXISTS"
	) {
		return t("orgUi.slugTaken");
	}
	if (code === "ORG_FROZEN") return t("errors.codes.ORG_FROZEN");
	if (code === "YOU_ARE_NOT_ALLOWED_TO_LEAVE_THIS_ORGANIZATION") {
		return t("errors.orgLeaveOwner");
	}
	if (code === "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION") {
		return t("errors.orgSettingsRequired");
	}
	if (code && code in INVITE_ERROR_KEYS) {
		return t(INVITE_ERROR_KEYS[code as keyof typeof INVITE_ERROR_KEYS]);
	}
	return apiErrorMessage(t, error, fallbackKey);
}

/** Accept-invitation failures keep the invite page's existing code map. */
export function inviteFailureMessage(t: TFunction, error: unknown): string {
	const code = getAuthErrorCode(error) ?? errorCode(error);
	if (
		isOrganizationQuotaError(error) ||
		code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED" ||
		code === "PLAN_LIMIT_EXCEEDED"
	) {
		return t("invite.errors.orgFull");
	}
	if (code && code in INVITE_ERROR_KEYS) {
		return t(INVITE_ERROR_KEYS[code as keyof typeof INVITE_ERROR_KEYS]);
	}
	return t("invite.errors.generic");
}
