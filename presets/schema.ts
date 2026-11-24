import { z } from "zod";

/**
 * Declarative feature/preset manifest schemas (template refactor Phase 0).
 *
 * `presets/features/*.json` and `presets/presets/*.json` are validated
 * against these schemas by `apps/api/tests/architecture.test.ts`. The
 * scaffold CLI (Phase 6) becomes the real consumer later; until then the
 * JSON files are the single source of truth for feature ownership and the
 * dependency graph.
 */

const FEATURE_ID = /^[a-z][a-z0-9-]*$/;

const featureId = z.string().regex(FEATURE_ID);

/** `+feature` — appended on top of the preset named by `extends`. */
const addedFeatureId = z.string().regex(/^\+[a-z][a-z0-9-]*$/);

const envDeclSchema = z.object({
	required: z.array(z.string()).optional(),
	optional: z.array(z.string()).optional(),
	mockFlag: z.string().optional(),
});

export const featureDeclSchema = z.object({
	id: featureId,
	/** 0 core, 1 workspace, 2 collaboration/planning, 3 commercial, 4 intelligence. */
	tier: z.number().int().min(0).max(4),
	/** Hard dependencies: the feature cannot be generated without them. */
	dependsOn: z.array(featureId),
	/** Soft dependencies: the feature degrades gracefully when absent. */
	softDependsOn: z.array(featureId).optional(),
	/** Environment contract (fail-closed semantics, declared centrally). */
	env: envDeclSchema.optional(),
	/**
	 * Repository paths (globs relative to the repo root) owned by this
	 * feature. Every business source file must be claimed by exactly one
	 * feature; the architecture test enforces this.
	 */
	claims: z.array(z.string().min(1)).min(1),
});

export const presetDeclSchema = z
	.object({
		name: featureId,
		/** Base preset whose feature set this preset extends. */
		extends: featureId.optional(),
		/**
		 * Feature ids, or `+id` additions on top of `extends`. Entries must
		 * all be additions when `extends` is set, and plain ids otherwise.
		 */
		features: z.array(z.union([featureId, addedFeatureId])).min(1),
		platform: z.array(z.enum(["cloudflare", "bun-selfhost"])).optional(),
		docs: z.array(z.string()).optional(),
	})
	.superRefine((preset, ctx) => {
		for (const feature of preset.features) {
			const isAddition = feature.startsWith("+");
			if (preset.extends && !isAddition) {
				ctx.addIssue({
					code: "custom",
					path: ["features"],
					message: `entry "${feature}" must be prefixed with "+" because the preset extends "${preset.extends}"`,
				});
			}
			if (!preset.extends && isAddition) {
				ctx.addIssue({
					code: "custom",
					path: ["features"],
					message: `entry "${feature}" uses "+" but the preset has no "extends"`,
				});
			}
		}
	});

export type FeatureDecl = z.infer<typeof featureDeclSchema>;

export type PresetDecl = z.infer<typeof presetDeclSchema>;
