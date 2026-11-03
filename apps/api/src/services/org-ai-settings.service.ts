import {
	ApiError,
	ApiErrorCode,
	type UpdateOrgAiSettingsInput,
} from "@workspace/shared";
import type { AiProviderInfo } from "../ai/provider";
import type { OrgAiSettingsDao } from "../dao/org-ai-settings.dao";
import type { OrgAiSettingsDto } from "../dto/ai.dto";

export const DEFAULT_AI_SETTINGS = {
	enabled: true,
	defaultModel: null,
	retentionDays: 30,
	strictMcpWrites: false,
} as const;

const defaultsFor = (orgId: string): OrgAiSettingsDto => ({
	orgId,
	enabled: DEFAULT_AI_SETTINGS.enabled,
	defaultModel: DEFAULT_AI_SETTINGS.defaultModel,
	retentionDays: DEFAULT_AI_SETTINGS.retentionDays,
	strictMcpWrites: DEFAULT_AI_SETTINGS.strictMcpWrites,
	updatedBy: null,
	updatedAt: null,
});

export const createOrgAiSettingsService = ({
	settingsDao,
}: {
	settingsDao: OrgAiSettingsDao;
}) => ({
	get: async (orgId: string): Promise<OrgAiSettingsDto> =>
		(await settingsDao.findByOrg(orgId)) ?? defaultsFor(orgId),

	isEnabled: async (orgId: string): Promise<boolean> =>
		(await settingsDao.findByOrg(orgId))?.enabled ?? true,

	update: async (
		orgId: string,
		userId: string,
		input: UpdateOrgAiSettingsInput,
		provider: AiProviderInfo,
	): Promise<OrgAiSettingsDto> => {
		if (input.defaultModel !== undefined && input.defaultModel !== null) {
			if (
				provider.models.length === 0 ||
				!provider.models.includes(input.defaultModel)
			) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					`Model "${input.defaultModel}" is not allowlisted. Available models: ${
						provider.models.join(", ") || "none"
					}.`,
				);
			}
		}

		const current = (await settingsDao.findByOrg(orgId)) ?? defaultsFor(orgId);
		return settingsDao.upsert(orgId, {
			enabled: input.enabled ?? current.enabled,
			defaultModel:
				input.defaultModel !== undefined
					? input.defaultModel
					: current.defaultModel,
			retentionDays: input.retentionDays ?? current.retentionDays,
			strictMcpWrites: input.strictMcpWrites ?? current.strictMcpWrites,
			updatedBy: userId,
		});
	},
});

export type OrgAiSettingsService = ReturnType<
	typeof createOrgAiSettingsService
>;
