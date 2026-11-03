import {
	ApiError,
	ApiErrorCode,
	type ApiKeyScope,
	scopeSatisfies,
} from "@workspace/shared";
import type { MemberDao } from "../dao/member.dao";
import type {
	CapabilityContext,
	CapabilityEntry,
	CapabilityResult,
} from "./types";

/**
 * Framework-neutral capability executor.
 *
 * It is the single choke point for authorization: callers (chat, panel, MCP,
 * public API) must go through `execute` so scope, role, freeze, org-scoping and
 * input/output validation cannot be skipped per surface.
 */

export type CapabilityMemberDao = Pick<
	MemberDao,
	"findByOrgAndUser" | "isOrgFrozen"
>;

const roleSatisfies = (
	role: string,
	minRole: "owner" | "admin" | undefined,
): boolean => {
	if (!minRole) return true;
	if (minRole === "owner") return role === "owner";
	return role === "owner" || role === "admin";
};

const missingScopes = (
	granted: readonly ApiKeyScope[],
	required: readonly ApiKeyScope[],
): ApiKeyScope[] => required.filter((scope) => !scopeSatisfies(granted, scope));

const invalidInput = (name: string, message: string): never => {
	throw new ApiError(
		400,
		ApiErrorCode.VALIDATION,
		`Invalid input for capability "${name}": ${message}`,
	);
};

export const createCapabilityExecutor = ({
	capabilities,
	memberDao,
}: {
	capabilities: readonly CapabilityEntry[];
	memberDao: CapabilityMemberDao;
}) => {
	const registry = new Map<string, CapabilityEntry>();
	for (const capability of capabilities) {
		if (registry.has(capability.name)) {
			throw new Error(`Duplicate capability name: ${capability.name}`);
		}
		registry.set(capability.name, capability);
	}

	const get = (name: string): CapabilityEntry | undefined => registry.get(name);

	const list = (): CapabilityEntry[] => [...registry.values()];

	const authorize = async (
		capability: CapabilityEntry,
		ctx: CapabilityContext,
	) => {
		const denied = missingScopes(ctx.actor.scopes, capability.scopes);
		if (denied.length > 0) {
			throw new ApiError(
				403,
				ApiErrorCode.MCP_FORBIDDEN_SCOPE,
				`This action requires the ${denied.join(", ")} API key scope.`,
			);
		}

		const orgScoped = capability.orgScoped !== false;
		if (orgScoped && !ctx.orgId) {
			throw new ApiError(
				400,
				ApiErrorCode.MCP_ORG_REQUIRED,
				"This capability requires an organization context.",
			);
		}

		const orgId = ctx.orgId;
		if (orgId) {
			if (ctx.actor.userId) {
				const membership = await memberDao.findByOrgAndUser(
					orgId,
					ctx.actor.userId,
				);
				if (!membership) {
					throw new ApiError(
						404,
						ApiErrorCode.NOT_FOUND,
						"Organization not found or you are not a member.",
					);
				}
				if (
					capability.minOrgRole &&
					!roleSatisfies(membership.role, capability.minOrgRole)
				) {
					throw new ApiError(
						403,
						ApiErrorCode.FORBIDDEN,
						`This action requires the ${capability.minOrgRole} organization role.`,
					);
				}
			} else if (capability.minOrgRole) {
				// API keys have no organization role. Admin-scoped keys may perform
				// admin-level writes; owner-only operations stay user-only.
				if (
					capability.minOrgRole === "owner" ||
					!ctx.actor.scopes.includes("admin")
				) {
					throw new ApiError(
						403,
						ApiErrorCode.FORBIDDEN,
						"This action requires a signed-in organization owner or admin.",
					);
				}
			}

			if (capability.effect !== "read") {
				if (!ctx.canWrite) {
					throw new ApiError(
						403,
						ApiErrorCode.FORBIDDEN,
						"Writes are not allowed in this conversation.",
					);
				}
				if (await memberDao.isOrgFrozen(orgId)) {
					throw new ApiError(
						403,
						ApiErrorCode.ORG_FROZEN,
						"Organization is frozen and cannot be modified.",
					);
				}
			}
		}
	};

	const execute = async <TData = unknown>(
		name: string,
		ctx: CapabilityContext,
		input: unknown,
	): Promise<CapabilityResult<TData>> => {
		const capability = registry.get(name);
		if (!capability) {
			throw new ApiError(
				404,
				ApiErrorCode.NOT_FOUND,
				`Unknown capability "${name}".`,
			);
		}

		await authorize(capability, ctx);

		const parsedInput = capability.input.safeParse(input);
		if (!parsedInput.success) {
			invalidInput(
				name,
				parsedInput.error.issues
					.map((issue) => {
						const path = issue.path.join(".");
						return path ? `${path}: ${issue.message}` : issue.message;
					})
					.join("; "),
			);
		}

		let result: CapabilityResult<unknown>;
		try {
			result = await capability.execute(ctx, parsedInput.data);
		} catch (err) {
			if (err instanceof ApiError) {
				throw err;
			}
			console.error(`[capabilities] ${name} failed:`, err);
			throw new ApiError(
				500,
				ApiErrorCode.AI_TOOL_FAILED,
				`Capability "${name}" failed.`,
			);
		}

		if (capability.output) {
			const parsedOutput = capability.output.safeParse(result.data);
			if (!parsedOutput.success) {
				console.error(
					`[capabilities] ${name} returned an invalid payload:`,
					parsedOutput.error.message,
				);
				throw new ApiError(
					500,
					ApiErrorCode.AI_TOOL_FAILED,
					`Capability "${name}" returned an invalid payload.`,
				);
			}
			// Curated output schemas strip unknown/sensitive fields.
			result = { ...result, data: parsedOutput.data };
		}

		return result as CapabilityResult<TData>;
	};

	return { execute, get, list };
};

export type CapabilityExecutor = ReturnType<typeof createCapabilityExecutor>;
