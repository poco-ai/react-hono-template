/**
 * 业务异常：handler 里随时 throw，由 createRoutes 里的 onError
 * 统一捕获并序列化成 ApiErr JSON，避免每个端点手写错误响应。
 *
 * HTTP 层意外错误（非 ApiError）会被兜底成 INTERNAL_ERROR / 500。
 */

export const ApiErrorCode = {
	INVALID_PARAM: "INVALID_PARAM",
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
	NOT_FOUND: "NOT_FOUND",
	CONFLICT: "CONFLICT",
	INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

// 注意：不用构造器参数属性（web 端开启了 erasableSyntaxOnly）
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
