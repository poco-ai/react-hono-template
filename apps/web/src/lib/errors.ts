import { i18n } from "@/i18n";

export const errorCode = (err: unknown): string | undefined =>
	typeof err === "object" && err !== null && "code" in err
		? String((err as { code?: unknown }).code)
		: undefined;

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

const ERROR_MESSAGE_KEYS = {
	ORG_FROZEN: "errors.orgFrozen",
	FORBIDDEN: "errors.forbidden",
	UNAUTHORIZED: "errors.unauthorized",
	UNAUTHENTICATED: "errors.unauthorized",
	PLAN_LIMIT_EXCEEDED: "errors.planLimit",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "errors.orgSettingsRequired",
	YOU_ARE_NOT_ALLOWED_TO_LEAVE_THIS_ORGANIZATION: "errors.orgLeaveOwner",
	INVALID_EMAIL_OR_PASSWORD: "errors.invalidEmailOrPassword",
	USER_ALREADY_EXISTS: "errors.userAlreadyExists",
} as const;

const translateError = (code: string, fallback: string): string => {
	if (code in ERROR_MESSAGE_KEYS) {
		const key = ERROR_MESSAGE_KEYS[code as keyof typeof ERROR_MESSAGE_KEYS];
		return i18n.t(key, { defaultValue: fallback });
	}
	return fallback;
};

export const errorMessage = (err: unknown): string => {
	const code = errorCode(err);
	const raw =
		err instanceof Error && err.message
			? err.message
			: ((err as { message?: string } | null)?.message ?? "");
	const fallback =
		raw.replace(/^\[[A-Z0-9_]+\]\s*/, "") || i18n.t("errors.unexpected");
	return code ? translateError(code, fallback) : fallback;
};
