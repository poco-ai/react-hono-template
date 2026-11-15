import {
	ApiError,
	ApiErrorCode,
	type CreateLabelInput,
	type UpdateLabelInput,
} from "@workspace/shared";
import type { LabelDao } from "../dao/label.dao";
import type { LabelDto } from "../dto/label.dto";
import { isUniqueConstraintViolation } from "../lib/db-errors";
import { createResourceCache } from "../lib/kv/resource-cache";
import type { CacheStore } from "../lib/kv/types";

const LABELS_KEY_PREFIX = "cache:v1:labels:";

export const labelsCacheKey = (orgId: string) =>
	`${LABELS_KEY_PREFIX}${encodeURIComponent(orgId)}`;

const orgIdFromLabelsKey = (key: string) =>
	decodeURIComponent(key.slice(LABELS_KEY_PREFIX.length));

// Label writes invalidate explicitly; the long TTL is only a fallback that
// keeps KV writes well inside the free-tier daily quota.
const LABELS_KV_TTL_SECONDS = 3600;
const LABELS_KV_CACHE_TTL_SECONDS = 30;

const isCachedLabelList = (value: unknown): value is LabelDto[] =>
	Array.isArray(value) &&
	value.every(
		(item) =>
			typeof item === "object" &&
			item !== null &&
			"id" in item &&
			typeof item.id === "string",
	);

const assertNameAvailable = async (
	dao: LabelDao,
	orgId: string,
	name: string,
	excludeId?: string,
) => {
	const existing = await dao.findByName(orgId, name);
	if (existing && existing.id !== excludeId) {
		throw new ApiError(
			ApiErrorCode.LABEL_NAME_TAKEN,
			`Label name "${name}" is already used in this organization`,
		);
	}
};

export const createLabelService = (dao: LabelDao, cache: CacheStore) => {
	const labels = createResourceCache<LabelDto[]>({
		cache,
		ttlSeconds: LABELS_KV_TTL_SECONDS,
		cacheTtlSeconds: LABELS_KV_CACHE_TTL_SECONDS,
		parse: (stored) => (isCachedLabelList(stored) ? stored : null),
		load: (key) => dao.listByOrg(orgIdFromLabelsKey(key)),
	});

	return {
		listLabels: async (orgId: string) => labels.get(labelsCacheKey(orgId)),

		createLabel: async (orgId: string, input: CreateLabelInput) => {
			await assertNameAvailable(dao, orgId, input.name);
			let created: LabelDto;
			try {
				created = await dao.create({
					id: crypto.randomUUID(),
					orgId,
					name: input.name,
					color: input.color,
				});
			} catch (err) {
				if (isUniqueConstraintViolation(err)) {
					throw new ApiError(
						ApiErrorCode.LABEL_NAME_TAKEN,
						`Label name "${input.name}" is already used in this organization`,
					);
				}
				throw err;
			}
			await labels.invalidate(labelsCacheKey(orgId));
			return created;
		},

		updateLabel: async (
			orgId: string,
			labelId: string,
			input: UpdateLabelInput,
		): Promise<LabelDto> => {
			const label = await dao.findById(orgId, labelId);
			if (!label) {
				throw new ApiError(
					ApiErrorCode.LABEL_NOT_FOUND,
					`Label ${labelId} not found`,
				);
			}
			if (input.name && input.name !== label.name) {
				await assertNameAvailable(dao, orgId, input.name, label.id);
			}
			const updated = await dao.update(orgId, labelId, {
				name: input.name,
				color: input.color,
			});
			if (!updated) {
				throw new ApiError(
					ApiErrorCode.LABEL_NOT_FOUND,
					`Label ${labelId} not found`,
				);
			}
			await labels.invalidate(labelsCacheKey(orgId));
			return updated;
		},

		deleteLabel: async (orgId: string, labelId: string) => {
			const label = await dao.findById(orgId, labelId);
			if (!label) {
				throw new ApiError(
					ApiErrorCode.LABEL_NOT_FOUND,
					`Label ${labelId} not found`,
				);
			}
			const references = await dao.countIssueReferences(orgId, labelId);
			if (references > 0) {
				throw new ApiError(
					ApiErrorCode.LABEL_IN_USE,
					`Label "${label.name}" is used by ${references} issue(s)`,
				);
			}
			await dao.delete(orgId, labelId);
			await labels.invalidate(labelsCacheKey(orgId));
		},
	};
};

export type LabelService = ReturnType<typeof createLabelService>;
