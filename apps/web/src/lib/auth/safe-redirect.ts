const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

/**
 * Keep a same-origin redirect target.
 *
 * Relative paths (a single leading `/`) and absolute URLs on
 * `window.location.origin` pass through. Protocol-relative URLs, other
 * origins, and anything else become `/`.
 */
export function resolveSafeRedirect(value: string | null | undefined): string {
	if (!value) return "/";
	const target = value.trim();
	if (!target || target.includes("\\")) return "/";
	if (target.startsWith("/") && !target.startsWith("//")) return target;
	if (typeof window === "undefined" || !ABSOLUTE_HTTP_URL.test(target)) {
		return "/";
	}
	try {
		const url = new URL(target);
		if (url.origin !== window.location.origin || url.username || url.password) {
			return "/";
		}
		return target;
	} catch {
		return "/";
	}
}

/** Absolute frontend URL for OAuth callbacks. Relative targets stay on this origin. */
export function frontendCallbackURL(redirectTo: string): string {
	const safe = resolveSafeRedirect(redirectTo);
	if (typeof window === "undefined") return safe;
	if (ABSOLUTE_HTTP_URL.test(safe)) return safe;
	return new URL(safe, window.location.origin).toString();
}
