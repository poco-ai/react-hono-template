const errorCode = (err: unknown): string | undefined =>
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
