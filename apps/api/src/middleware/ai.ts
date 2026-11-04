import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import { createMiddleware } from "hono/factory";
import type { AiProviderInfo } from "../ai/provider";
import type { AiUsageService } from "../services/ai-usage.service";
import type { OrgAiSettingsService } from "../services/org-ai-settings.service";
import type { PlanService } from "../services/plan.service";
import type { SessionEnv } from "./auth";
import type { OrgEnv } from "./org";

/** Requires the global AI flag and the organization-level AI setting. */
export const requireAiEnabled = (
	settings: OrgAiSettingsService,
	provider: AiProviderInfo,
) =>
	createMiddleware<SessionEnv & OrgEnv>(async (c, next) => {
		if (!provider.enabled) {
			throw new ApiError(
				ApiErrorCode.AI_DISABLED,
				"AI is disabled for this deployment.",
			);
		}
		const { orgId } = c.get("orgMember");
		if (!(await settings.isEnabled(orgId))) {
			throw new ApiError(
				ApiErrorCode.AI_DISABLED,
				"AI is disabled for this organization.",
			);
		}
		await next();
	});

/** Chat additionally requires a usable provider configuration. */
export const requireAiConfigured = (provider: AiProviderInfo) =>
	createMiddleware<SessionEnv & OrgEnv>(async (_c, next) => {
		if (!provider.configured) {
			throw new ApiError(
				ApiErrorCode.AI_NOT_CONFIGURED,
				"AI provider is not configured.",
			);
		}
		await next();
	});

/** Per-user, per-organization chat rate limit (plan-based binding). */
export const aiChatRateLimit = (plans: PlanService, usage: AiUsageService) =>
	createMiddleware<SessionEnv & OrgEnv>(async (c, next) => {
		const { orgId, userId } = c.get("orgMember");
		const plan = await plans.getPlanForOrg(orgId);
		c.header("X-RateLimit-Limit", String(PLANS[plan].aiRequestsPerMinute));
		try {
			await usage.assertRateLimit(plan, `${orgId}:${userId}`);
		} catch (err) {
			if (
				err instanceof ApiError &&
				err.code === ApiErrorCode.AI_RATE_LIMITED
			) {
				c.header("Retry-After", "60");
			}
			throw err;
		}
		await next();
	});
