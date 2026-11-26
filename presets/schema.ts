import { z } from "zod";

/**
 * Declarative feature/preset manifest schemas.
 *
 * `presets/features/*.json` and `presets/presets/*.json` are the single
 * source of truth for feature ownership and the dependency graph.
 * `apps/api/tests/architecture.test.ts` validates them against these
 * schemas, and the create-app CLI (`packages/create-app`) resolves both
 * preset and custom selections from them before trimming the template.
 */

const FEATURE_ID = /^[a-z][a-z0-9-]*$/;

const featureId = z.string().regex(FEATURE_ID);

/** `+feature` — appended on top of the preset named by `extends`. */
const addedFeatureId = z.string().regex(/^\+[a-z][a-z0-9-]*$/);

/** Display metadata rendered by the create-app interactive picker. */
const displayLabel = z.string().min(1).optional();
const displayDescription = z.string().min(1).optional();

const envDeclSchema = z.object({
	required: z.array(z.string()).optional(),
	optional: z.array(z.string()).optional(),
	mockFlag: z.string().optional(),
});

export const featureDeclSchema = z.object({
	id: featureId,
	/** Display name rendered by the create-app interactive picker. */
	label: displayLabel,
	/** One-line summary rendered as the option hint. */
	description: displayDescription,
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
		/** Display name rendered by the create-app interactive picker. */
		label: displayLabel,
		/** One-line summary rendered as the option hint. */
		description: displayDescription,
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
