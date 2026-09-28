import {
	ApiError,
	ApiErrorCode,
	type CreateLabelInput,
	type UpdateLabelInput,
} from "@workspace/shared";
import type { LabelDao } from "../dao/label.dao";
import type { LabelDto } from "../dto/label.dto";

const assertNameAvailable = async (
	dao: LabelDao,
	orgId: string,
	name: string,
	excludeId?: string,
) => {
	const existing = await dao.findByName(orgId, name);
	if (existing && existing.id !== excludeId) {
		throw new ApiError(
			409,
			ApiErrorCode.LABEL_NAME_TAKEN,
			`Label name "${name}" is already used in this organization`,
		);
	}
};

export const createLabelService = (dao: LabelDao) => ({
	listLabels: (orgId: string) => dao.listByOrg(orgId),

	createLabel: async (orgId: string, input: CreateLabelInput) => {
		await assertNameAvailable(dao, orgId, input.name);
		try {
			return await dao.create({
				id: crypto.randomUUID(),
				orgId,
				name: input.name,
				color: input.color,
			});
		} catch (err) {
			if (err instanceof Error && /unique constraint/i.test(err.message)) {
				throw new ApiError(
					409,
					ApiErrorCode.LABEL_NAME_TAKEN,
					`Label name "${input.name}" is already used in this organization`,
				);
			}
			throw err;
		}
	},

	updateLabel: async (
		orgId: string,
		labelId: string,
		input: UpdateLabelInput,
	): Promise<LabelDto> => {
		const label = await dao.findById(orgId, labelId);
		if (!label) {
			throw new ApiError(
				404,
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
				404,
				ApiErrorCode.LABEL_NOT_FOUND,
				`Label ${labelId} not found`,
			);
		}
		return updated;
	},

	deleteLabel: async (orgId: string, labelId: string) => {
		const label = await dao.findById(orgId, labelId);
		if (!label) {
			throw new ApiError(
				404,
				ApiErrorCode.LABEL_NOT_FOUND,
				`Label ${labelId} not found`,
			);
		}
		const references = await dao.countIssueReferences(orgId, labelId);
		if (references > 0) {
			throw new ApiError(
				409,
				ApiErrorCode.LABEL_IN_USE,
				`Label "${label.name}" is used by ${references} issue(s)`,
			);
		}
		await dao.delete(orgId, labelId);
	},
});

export type LabelService = ReturnType<typeof createLabelService>;
