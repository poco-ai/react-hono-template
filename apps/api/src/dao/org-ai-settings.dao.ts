import { eq } from "drizzle-orm";
import { orgAiSettings } from "../db/schema";
import type { Database } from "../db/types";
import type { OrgAiSettingsDto } from "../dto/ai.dto";

type SettingsRow = typeof orgAiSettings.$inferSelect;

export type OrgAiSettingsPatch = {
	enabled: boolean;
	defaultModel: string | null;
	retentionDays: number;
	strictMcpWrites: boolean;
	updatedBy: string | null;
};

const toDto = (row: SettingsRow): OrgAiSettingsDto => ({
	orgId: row.orgId,
	enabled: row.enabled,
	defaultModel: row.defaultModel,
	retentionDays: row.retentionDays,
	strictMcpWrites: row.strictMcpWrites,
	updatedBy: row.updatedBy,
	updatedAt: row.updatedAt.toISOString(),
});

export const createOrgAiSettingsDao = (db: Database) => ({
	findByOrg: async (orgId: string): Promise<OrgAiSettingsDto | null> => {
		const row = await db
			.select()
			.from(orgAiSettings)
			.where(eq(orgAiSettings.orgId, orgId))
			.get();
		return row ? toDto(row) : null;
	},

	upsert: async (
		orgId: string,
		patch: OrgAiSettingsPatch,
	): Promise<OrgAiSettingsDto> => {
		const row = await db
			.insert(orgAiSettings)
			.values({ orgId, ...patch })
			.onConflictDoUpdate({
				target: orgAiSettings.orgId,
				set: {
					enabled: patch.enabled,
					defaultModel: patch.defaultModel,
					retentionDays: patch.retentionDays,
					strictMcpWrites: patch.strictMcpWrites,
					updatedBy: patch.updatedBy,
				},
			})
			.returning()
			.get();
		return toDto(row);
	},
});

export type OrgAiSettingsDao = ReturnType<typeof createOrgAiSettingsDao>;
