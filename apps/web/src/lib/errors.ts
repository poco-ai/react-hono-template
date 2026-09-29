import type { ApiErrorCode } from "@workspace/shared";
import type { TFunction } from "i18next";
import { i18n } from "@/i18n";
import type en from "@/i18n/locales/en";

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;

type FlattenKeys<T, P extends string = ""> = T extends string
	? P
	: {
			[K in keyof T & string]: FlattenKeys<T[K], Join<P, K>>;
		}[keyof T & string];

export type TranslationKey = FlattenKeys<typeof en>;
export type ErrorKey = FlattenKeys<typeof en.errors, "errors">;

export const errorCode = (err: unknown): string | undefined => {
	if (typeof err !== "object" || err === null || !("code" in err)) {
		return undefined;
	}
	const code = (err as { code?: unknown }).code;
	return typeof code === "string" && code.length > 0 ? code : undefined;
};

export const isNotFoundError = (err: unknown): boolean => {
	const code = errorCode(err);
	return code === "NOT_FOUND" || (code?.endsWith("_NOT_FOUND") ?? false);
};

export const isClientError = (err: unknown): boolean => {
	const code = errorCode(err);
	if (code === "RATE_LIMITED") {
		return false;
	}
	return code !== undefined && code !== "INTERNAL_ERROR";
};

// Whitelist of API error codes that have a dedicated translation, typed so
// that keys must exist in the en locale. Codes not listed here (and network
// failures, which carry no code) fall back to `fallbackKey`/`errors.generic`.
const CODE_MESSAGE_KEYS: Partial<Record<ApiErrorCode, ErrorKey>> &
	Record<string, ErrorKey> = {
	ORG_FROZEN: "errors.codes.ORG_FROZEN",
	PLAN_LIMIT_EXCEEDED: "errors.codes.PLAN_LIMIT_EXCEEDED",
	NOT_FOUND: "errors.codes.NOT_FOUND",
	FORBIDDEN: "errors.codes.FORBIDDEN",
	UNAUTHORIZED: "errors.codes.UNAUTHORIZED",
	UNAUTHENTICATED: "errors.codes.UNAUTHORIZED",
	VALIDATION: "errors.codes.VALIDATION",
	INVALID_PARAM: "errors.codes.VALIDATION",
	CONFLICT: "errors.codes.CONFLICT",
	INVALID_EMAIL_OR_PASSWORD: "errors.invalidEmailOrPassword",
	USER_ALREADY_EXISTS: "errors.userAlreadyExists",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "errors.orgSettingsRequired",
	YOU_ARE_NOT_ALLOWED_TO_LEAVE_THIS_ORGANIZATION: "errors.orgLeaveOwner",
};

export const apiErrorMessage = (
	t: TFunction,
	error: unknown,
	fallbackKey: TranslationKey = "errors.generic",
): string => {
	const code = errorCode(error);
	if (code) {
		const key = CODE_MESSAGE_KEYS[code];
		if (key) {
			return t(key);
		}
		if (code === "NOT_FOUND" || code.endsWith("_NOT_FOUND")) {
			return t("errors.codes.NOT_FOUND");
		}
	}
	return t(fallbackKey);
};

const translateCode = (code: string, fallback: string): string => {
	const key = CODE_MESSAGE_KEYS[code];
	return key ? i18n.t(key, { defaultValue: fallback }) : fallback;
};

export const errorMessage = (err: unknown): string => {
	const code = errorCode(err);
	const raw =
		err instanceof Error && err.message
			? err.message
			: ((err as { message?: string } | null)?.message ?? "");
	const fallback =
		raw.replace(/^\[[A-Z0-9_]+\]\s*/, "") || i18n.t("errors.generic");
	return code ? translateCode(code, fallback) : fallback;
};
