import {
	ApiError,
	ApiErrorCode,
	type CreateStatusInput,
	DEFAULT_ISSUE_STATUSES,
	normalizeStatusNameKey,
	type ReorderStatusesInput,
	type UpdateStatusInput,
} from "@workspace/shared";
import type { StatusDao } from "../dao/status.dao";
import type { StatusDto } from "../dto/status.dto";
import { isUniqueConstraintViolation } from "../lib/db-errors";

const statusesNotFound = (id: string) =>
	new ApiError(ApiErrorCode.STATUS_NOT_FOUND, `Status ${id} not found`);

const nameTaken = (name: string) =>
	new ApiError(
		ApiErrorCode.STATUS_NAME_TAKEN,
		`Status name "${name}" is already used in this organization`,
	);

/** Case-insensitive name comparison; the DB unique index is case-sensitive. */
const sameName = (a: string, b: string) =>
	a.trim().toLowerCase() === b.trim().toLowerCase();

/** Mirrors the reorder schema limit so create cannot exceed it. */
const MAX_STATUSES = 50;

export const createStatusService = (dao: StatusDao) => {
	const seedDefaults = async (orgId: string) => {
		await dao.insertMany(
			DEFAULT_ISSUE_STATUSES.map((status) => ({
				id: crypto.randomUUID(),
				orgId,
				name: status.name,
				category: status.category,
				color: status.color,
				position: status.position,
				isDefault: status.isDefault,
			})),
		);
	};

	/** Idempotent seed used when an organization is created or self-heals. */
	const ensureDefaultStatuses = async (orgId: string) => {
		const existing = await dao.countByOrg(orgId);
		if (existing > 0) {
			return dao.listByOrg(orgId);
		}
		try {
			await seedDefaults(orgId);
		} catch (err) {
			// Two concurrent first reads can both seed; the unique index makes
			// the loser fail and read the winner's rows instead.
			if (!isUniqueConstraintViolation(err)) {
				throw err;
			}
		}
		return dao.listByOrg(orgId);
	};

	const requireStatus = async (
		orgId: string,
		statusId: string,
	): Promise<StatusDto> => {
		const status = await dao.findById(orgId, statusId);
		if (!status) {
			throw statusesNotFound(statusId);
		}
		return status;
	};

	const assertNameAvailable = async (
		orgId: string,
		name: string,
		excludeId?: string,
	) => {
		const statuses = await dao.listByOrg(orgId);
		const existing = statuses.find(
			(status) => status.id !== excludeId && sameName(status.name, name),
		);
		if (existing) {
			throw nameTaken(name);
		}
	};

	const defaultStatusOf = (statuses: StatusDto[]) =>
		statuses.find((status) => status.isDefault) ?? statuses[0] ?? null;

	const resolveLegacyName = (statuses: StatusDto[], name: string) => {
		const key = normalizeStatusNameKey(name);
		return (
			statuses.find((status) => normalizeStatusNameKey(status.name) === key) ??
			null
		);
	};

	return {
		/** Reads the workflow, seeding defaults if the organization has none. */
		listStatuses: async (orgId: string): Promise<StatusDto[]> => {
			const statuses = await dao.listByOrg(orgId);
			if (statuses.length > 0) {
				return statuses;
			}
			return ensureDefaultStatuses(orgId);
		},

		ensureDefaultStatuses,

		/**
		 * Resolves the status an issue write/filter refers to. `statusId` wins;
		 * the legacy `status` name is matched against the status name (normalized
		 * so `in_progress` maps to `In Progress`). Without either, the
		 * organization default (or the first position) is used.
		 */
		resolveStatus: async (
			orgId: string,
			input: { statusId?: string; statusName?: string },
		): Promise<StatusDto> => {
			if (input.statusId) {
				return requireStatus(orgId, input.statusId);
			}
			let statuses = await dao.listByOrg(orgId);
			if (statuses.length === 0) {
				await seedDefaults(orgId);
				statuses = await dao.listByOrg(orgId);
			}
			if (input.statusName) {
				const match = resolveLegacyName(statuses, input.statusName);
				if (!match) {
					// 400 (not 404): the organization exists, the legacy name is
					// simply not a valid workflow value.
					throw new ApiError(
						ApiErrorCode.VALIDATION,
						`Status "${input.statusName}" does not exist in this organization`,
					);
				}
				return match;
			}
			const fallback = defaultStatusOf(statuses);
			if (!fallback) {
				throw new ApiError(
					ApiErrorCode.STATUS_NOT_FOUND,
					"This organization has no workflow status",
				);
			}
			return fallback;
		},

		/** Resolves list filters: status ids plus legacy names, deduplicated. */
		resolveStatusIds: async (
			orgId: string,
			input: { statusIds?: string[]; statusNames?: string[] },
		): Promise<string[]> => {
			const ids = new Set(input.statusIds ?? []);
			const names = input.statusNames ?? [];
			if (names.length > 0) {
				const statuses = await dao.listByOrg(orgId);
				for (const name of names) {
					const match = resolveLegacyName(statuses, name);
					if (!match) {
						// Silently dropping the name would make the filter look
						// successful while returning every issue.
						throw new ApiError(
							ApiErrorCode.VALIDATION,
							`Status "${name}" does not exist in this organization`,
						);
					}
					ids.add(match.id);
				}
			}
			return [...ids];
		},

		createStatus: async (
			orgId: string,
			input: CreateStatusInput,
		): Promise<StatusDto> => {
			await assertNameAvailable(orgId, input.name);
			const statuses = await dao.listByOrg(orgId);
			if (statuses.length >= MAX_STATUSES) {
				throw new ApiError(
					ApiErrorCode.VALIDATION,
					`An organization can have at most ${MAX_STATUSES} statuses`,
				);
			}
			const position =
				statuses.reduce((max, status) => Math.max(max, status.position), -1) +
				1;
			try {
				return await dao.create({
					id: crypto.randomUUID(),
					orgId,
					name: input.name,
					category: input.category,
					color: input.color,
					position,
					isDefault: false,
				});
			} catch (err) {
				if (isUniqueConstraintViolation(err)) {
					throw nameTaken(input.name);
				}
				throw err;
			}
		},

		updateStatus: async (
			orgId: string,
			statusId: string,
			input: UpdateStatusInput,
		): Promise<StatusDto> => {
			const current = await requireStatus(orgId, statusId);
			if (input.name && !sameName(input.name, current.name)) {
				await assertNameAvailable(orgId, input.name, statusId);
			}
			try {
				// Field changes and the default switch commit atomically in one
				// DAO batch; `isDefault: false` is a no-op (the organization
				// keeps its current default until another status is promoted).
				const updated = await dao.updateWithDefault(
					orgId,
					statusId,
					{
						name: input.name,
						category: input.category,
						color: input.color,
					},
					input.isDefault === true,
				);
				if (!updated) {
					throw statusesNotFound(statusId);
				}
				return updated;
			} catch (err) {
				if (isUniqueConstraintViolation(err)) {
					throw nameTaken(input.name ?? current.name);
				}
				throw err;
			}
		},

		reorderStatuses: async (
			orgId: string,
			input: ReorderStatusesInput,
		): Promise<StatusDto[]> => {
			const statuses = await dao.listByOrg(orgId);
			const known = new Set(statuses.map((status) => status.id));
			const ids = input.ids;
			const valid =
				ids.length === statuses.length &&
				new Set(ids).size === ids.length &&
				ids.every((id) => known.has(id));
			if (!valid) {
				throw new ApiError(
					ApiErrorCode.VALIDATION,
					"Reorder requires the complete list of status ids",
				);
			}
			await dao.reorder(
				orgId,
				ids.map((id, position) => ({ id, position })),
			);
			return dao.listByOrg(orgId);
		},

		deleteStatus: async (
			orgId: string,
			statusId: string,
			actorId: string,
			migrateToStatusId?: string,
		) => {
			const status = await requireStatus(orgId, statusId);
			const statuses = await dao.listByOrg(orgId);
			if (statuses.length <= 1) {
				throw new ApiError(
					ApiErrorCode.STATUS_LAST_STATUS,
					"An organization must keep at least one status",
				);
			}
			const references = await dao.countIssueReferences(orgId, statusId);
			if (references > 0 && !migrateToStatusId) {
				throw new ApiError(
					ApiErrorCode.STATUS_MIGRATION_REQUIRED,
					`Status "${status.name}" is used by ${references} issue(s); provide migrateToStatusId`,
				);
			}
			let target: StatusDto | null = null;
			if (migrateToStatusId) {
				if (migrateToStatusId === statusId) {
					throw new ApiError(
						ApiErrorCode.STATUS_MIGRATION_INVALID,
						"migrateToStatusId must be a different status",
					);
				}
				target =
					statuses.find((entry) => entry.id === migrateToStatusId) ?? null;
				if (!target) {
					throw new ApiError(
						ApiErrorCode.STATUS_MIGRATION_INVALID,
						`Migration target ${migrateToStatusId} does not belong to this organization`,
					);
				}
			}
			const promoteDefaultId = status.isDefault
				? statuses.find((entry) => entry.id !== statusId)?.id
				: undefined;
			// Activities are written by the DAO with a single INSERT ... SELECT in
			// the same batch. Per-issue webhooks are deliberately not dispatched:
			// deleting a widely used status could otherwise enqueue an unbounded
			// number of deliveries from one request. Subscribers still see the
			// next issue update/delete for those issues.
			const deleted = await dao.deleteWithMigration({
				orgId,
				id: statusId,
				migrateToId: target?.id,
				migrateToName: target?.name,
				oldStatusName: status.name,
				actorId,
				promoteDefaultId,
			});
			if (!deleted) {
				throw statusesNotFound(statusId);
			}
			return {
				deleted: true,
				migratedIssueCount: references,
				migratedToStatusId: target?.id ?? null,
			};
		},
	};
};

export type StatusService = ReturnType<typeof createStatusService>;
