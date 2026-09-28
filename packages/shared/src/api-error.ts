export const ApiErrorCode = {
	INVALID_PARAM: "INVALID_PARAM",
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
	NOT_FOUND: "NOT_FOUND",
	CONFLICT: "CONFLICT",
	FILE_TOO_LARGE: "FILE_TOO_LARGE",
	FILE_TYPE_NOT_ALLOWED: "FILE_TYPE_NOT_ALLOWED",
	STORAGE_ERROR: "STORAGE_ERROR",
	INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export class ApiError extends Error {
	readonly status: number;
	readonly code: ApiErrorCode | string;

	constructor(status: number, code: ApiErrorCode | string, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
	}
}
