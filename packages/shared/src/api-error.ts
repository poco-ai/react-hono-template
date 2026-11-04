/**
 * Canonical error-code → HTTP-status mapping. Every `ApiError` thrown in the
 * API resolves its status from this registry, so the same code can never
 * surface with different statuses across endpoints or API surfaces. Values
 * may be overridden per-throw when a specific status is genuinely required.
 */
export const ERROR_STATUS = {
	INVALID_PARAM: 400,
	VALIDATION: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	PROJECT_NOT_FOUND: 404,
	ISSUE_NOT_FOUND: 404,
	LABEL_NOT_FOUND: 404,
	PROJECT_KEY_TAKEN: 409,
	LABEL_NAME_TAKEN: 409,
	LABEL_IN_USE: 409,
	STATUS_NOT_FOUND: 404,
	STATUS_NAME_TAKEN: 409,
	STATUS_LAST_STATUS: 400,
	STATUS_MIGRATION_REQUIRED: 400,
	STATUS_MIGRATION_INVALID: 400,
	ISSUE_PARENT_INVALID: 400,
	ISSUE_PARENT_DEPTH: 400,
	ISSUE_RELATION_INVALID: 400,
	ISSUE_RELATION_EXISTS: 409,
	ISSUE_RELATION_CYCLE: 409,
	PROJECT_ARCHIVED: 409,
	CYCLE_NOT_FOUND: 404,
	CYCLE_OVERLAP: 409,
	CYCLE_RANGE_INVALID: 400,
	CYCLE_TARGET_INVALID: 400,
	PROJECT_UPDATE_NOT_FOUND: 404,
	COMMENT_NOT_FOUND: 404,
	COMMENT_PARENT_INVALID: 400,
	COMMENT_THREAD_DEPTH: 400,
	NOTIFICATION_NOT_FOUND: 404,
	ATTACHMENT_NOT_FOUND: 404,
	KEY_MISMATCH: 400,
	FILE_TOO_LARGE: 413,
	FILE_TYPE_NOT_ALLOWED: 415,
	STORAGE_ERROR: 400,
	STORAGE_QUOTA_EXCEEDED: 403,
	UPLOAD_NOT_PENDING: 400,
	ASSET_NOT_FOUND: 404,
	UNSUPPORTED_MEDIA_TYPE: 415,
	SERVICE_UNAVAILABLE: 503,
	RATE_LIMITED: 429,
	API_KEY_NOT_FOUND: 404,
	WEBHOOK_NOT_FOUND: 404,
	WEBHOOK_EVENT_INVALID: 400,
	PLAN_LIMIT_EXCEEDED: 403,
	VIEW_NOT_FOUND: 404,
	VIEW_LIMIT_REACHED: 403,
	ORG_FROZEN: 403,
	BILLING_ERROR: 400,
	INTERNAL_ERROR: 500,
	AI_NOT_CONFIGURED: 503,
	AI_DISABLED: 403,
	AI_QUOTA_EXCEEDED: 429,
	AI_RATE_LIMITED: 429,
	AI_CONVERSATION_NOT_FOUND: 404,
	AI_MESSAGE_INVALID: 400,
	AI_APPROVAL_NOT_FOUND: 400,
	AI_TOOL_FAILED: 500,
	MCP_UNAUTHORIZED: 401,
	MCP_FORBIDDEN_SCOPE: 403,
	MCP_ORG_REQUIRED: 400,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

/** Error-code enum (`ApiErrorCode.NOT_FOUND === "NOT_FOUND"`), derived from the registry keys. */
export const ApiErrorCode = Object.fromEntries(
	Object.keys(ERROR_STATUS).map((code) => [code, code]),
) as Record<ApiErrorCode, ApiErrorCode>;

export class ApiError extends Error {
	readonly status: number;
	readonly code: ApiErrorCode | string;

	/**
	 * The status defaults to the registry value for `code`; pass one only when
	 * the same code intentionally needs a different status somewhere.
	 */
	constructor(code: ApiErrorCode | string, message: string, status?: number) {
		super(message);
		this.name = "ApiError";
		this.code = code;
		this.status =
			status ?? (ERROR_STATUS as Record<string, number>)[code] ?? 500;
	}
}
