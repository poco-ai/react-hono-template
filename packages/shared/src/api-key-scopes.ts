/**
 * API key scopes.
 *
 * Scopes are cumulative: `write` implies `read`, and `admin` implies both
 * `write` and `read`. Keys created before scopes existed receive every scope so
 * their behaviour is unchanged.
 */
export const API_KEY_SCOPES = ["read", "write", "admin"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const DEFAULT_API_KEY_SCOPES: readonly ApiKeyScope[] = API_KEY_SCOPES;

const SCOPE_RANK: Record<ApiKeyScope, number> = {
	read: 0,
	write: 1,
	admin: 2,
};

export const isApiKeyScope = (value: unknown): value is ApiKeyScope =>
	typeof value === "string" && Object.hasOwn(SCOPE_RANK, value);

/**
 * Normalizes arbitrary stored values (JSON columns, request payloads) into a
 * de-duplicated list of known scopes. Unknown entries are dropped. An empty or
 * invalid list falls back to read-only access.
 */
export const normalizeApiKeyScopes = (value: unknown): ApiKeyScope[] => {
	if (!Array.isArray(value)) {
		return ["read"];
	}
	const scopes = new Set<ApiKeyScope>();
	for (const item of value) {
		if (isApiKeyScope(item)) {
			scopes.add(item);
		}
	}
	if (scopes.size === 0) {
		scopes.add("read");
	}
	return [...scopes].sort((a, b) => SCOPE_RANK[a] - SCOPE_RANK[b]);
};

/** Whether the granted scopes allow the required scope (cumulative ranks). */
export const scopeSatisfies = (
	granted: readonly ApiKeyScope[],
	required: ApiKeyScope,
): boolean =>
	granted.some((scope) => SCOPE_RANK[scope] >= SCOPE_RANK[required]);

/** Whether every required scope is covered by the granted scopes. */
export const scopesSatisfy = (
	granted: readonly ApiKeyScope[],
	required: readonly ApiKeyScope[],
): boolean => required.every((scope) => scopeSatisfies(granted, scope));
