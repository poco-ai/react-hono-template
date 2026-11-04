/**
 * Access rules shared by every capability surface (executor, chat tools and
 * MCP tools). Role/scope semantics are authorization-domain knowledge — they
 * must live here once instead of being re-implemented per adapter.
 */

/** Whether `role` meets `minRole` (owner > admin > member). No floor passes. */
export const roleSatisfies = (
	role: string | undefined,
	minRole: "owner" | "admin" | undefined,
): boolean => {
	if (!minRole) return true;
	if (minRole === "owner") return role === "owner";
	return role === "owner" || role === "admin";
};
