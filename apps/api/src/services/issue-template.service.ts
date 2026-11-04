import {
	ApiError,
	ApiErrorCode,
	type CreateIssueTemplateInput,
	type UpdateIssueTemplateInput,
} from "@workspace/shared";
import type { IssueTemplateDao } from "../dao/issue-template.dao";
import type { LabelDao } from "../dao/label.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { StatusDao } from "../dao/status.dao";
import type { IssueTemplateDto } from "../dto/issue-template.dto";

const MAX_TEMPLATE_LABELS = 20;

type TemplatePatch = Partial<{
	projectId: string | null;
	name: string;
	title: string;
	description: string | null;
	statusId: string | null;
	priority: number | null;
	labelIds: string[];
	estimate: number | null;
}>;

const isUniqueViolation = (err: unknown) =>
	err instanceof Error && /unique constraint/i.test(err.message);

const nameTaken = (name: string) =>
	new ApiError(
		ApiErrorCode.CONFLICT,
		`A template named "${name}" already exists in this scope`,
	);

/**
 * Issue template CRUD. Templates are prefills only — applying one happens in
 * the client. Every referenced project/status/label must belong to the same
 * organization, and names are unique per (organization, project) scope.
 */
export const createIssueTemplateService = ({
	templateDao,
	projectDao,
	statusDao,
	labelDao,
}: {
	templateDao: IssueTemplateDao;
	projectDao: Pick<ProjectDao, "findById">;
	statusDao: Pick<StatusDao, "findById">;
	labelDao: Pick<LabelDao, "findByIds">;
}) => {
	const assertProjectInOrg = async (
		orgId: string,
		projectId: string | null | undefined,
	) => {
		if (!projectId) {
			return;
		}
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
	};

	const assertStatusInOrg = async (
		orgId: string,
		statusId: string | null | undefined,
	) => {
		if (!statusId) {
			return;
		}
		const status = await statusDao.findById(orgId, statusId);
		if (!status) {
			throw new ApiError(
				ApiErrorCode.STATUS_NOT_FOUND,
				`Status ${statusId} not found`,
			);
		}
	};

	/** Deduplicates labels and verifies every id belongs to the organization. */
	const normalizeLabelIds = async (
		orgId: string,
		labelIds: string[] | undefined,
	): Promise<string[] | undefined> => {
		if (labelIds === undefined) {
			return undefined;
		}
		const unique = [...new Set(labelIds)];
		if (unique.length > MAX_TEMPLATE_LABELS) {
			throw new ApiError(
				ApiErrorCode.VALIDATION,
				`A template can reference at most ${MAX_TEMPLATE_LABELS} labels`,
			);
		}
		if (unique.length === 0) {
			return unique;
		}
		const found = await labelDao.findByIds(orgId, unique);
		if (found.length !== unique.length) {
			throw new ApiError(
				ApiErrorCode.LABEL_NOT_FOUND,
				"One or more labels do not exist in this organization",
			);
		}
		return unique;
	};

	const assertNameAvailable = async (
		orgId: string,
		projectId: string | null,
		name: string,
		excludeId?: string,
	) => {
		const existing = await templateDao.findByName(orgId, projectId, name);
		if (existing && existing.id !== excludeId) {
			throw nameTaken(name);
		}
	};

	const requireTemplate = async (
		orgId: string,
		id: string,
	): Promise<IssueTemplateDto> => {
		const template = await templateDao.findById(orgId, id);
		if (!template) {
			throw new ApiError(
				ApiErrorCode.NOT_FOUND,
				`Issue template ${id} not found`,
			);
		}
		return template;
	};

	return {
		listTemplates: async (
			orgId: string,
			query: { projectId?: string } = {},
		): Promise<IssueTemplateDto[]> =>
			templateDao.listByOrg(orgId, query.projectId),

		getTemplate: async (orgId: string, id: string): Promise<IssueTemplateDto> =>
			requireTemplate(orgId, id),

		createTemplate: async (
			orgId: string,
			userId: string | null,
			input: CreateIssueTemplateInput,
		): Promise<IssueTemplateDto> => {
			const projectId = input.projectId ?? null;
			await assertProjectInOrg(orgId, projectId);
			await assertStatusInOrg(orgId, input.statusId);
			const labelIds = (await normalizeLabelIds(orgId, input.labelIds)) ?? [];
			await assertNameAvailable(orgId, projectId, input.name);
			try {
				return await templateDao.create({
					id: crypto.randomUUID(),
					orgId,
					projectId,
					name: input.name,
					title: input.title,
					description: input.description ?? null,
					statusId: input.statusId ?? null,
					priority: input.priority ?? null,
					labelIds,
					estimate: input.estimate ?? null,
					createdById: userId,
				});
			} catch (err) {
				// Concurrent creates can still race past the name check.
				if (isUniqueViolation(err)) {
					throw nameTaken(input.name);
				}
				throw err;
			}
		},

		updateTemplate: async (
			orgId: string,
			id: string,
			input: UpdateIssueTemplateInput,
		): Promise<IssueTemplateDto> => {
			const template = await requireTemplate(orgId, id);
			const projectId =
				input.projectId === undefined
					? template.projectId
					: (input.projectId ?? null);
			await assertProjectInOrg(orgId, projectId);
			await assertStatusInOrg(orgId, input.statusId);
			const labelIds = await normalizeLabelIds(orgId, input.labelIds);
			const name = input.name ?? template.name;
			if (name !== template.name || projectId !== template.projectId) {
				await assertNameAvailable(orgId, projectId, name, id);
			}
			const patch: TemplatePatch = {
				projectId: input.projectId === undefined ? undefined : projectId,
				name: input.name,
				title: input.title,
				description:
					"description" in input ? (input.description ?? null) : undefined,
				statusId: "statusId" in input ? (input.statusId ?? null) : undefined,
				priority: "priority" in input ? (input.priority ?? null) : undefined,
				labelIds,
				estimate: "estimate" in input ? (input.estimate ?? null) : undefined,
			};
			try {
				const updated = await templateDao.update(orgId, id, patch);
				if (!updated) {
					throw new ApiError(
						ApiErrorCode.NOT_FOUND,
						`Issue template ${id} not found`,
					);
				}
				return updated;
			} catch (err) {
				if (isUniqueViolation(err)) {
					throw nameTaken(name);
				}
				throw err;
			}
		},

		deleteTemplate: async (orgId: string, id: string): Promise<void> => {
			const deleted = await templateDao.delete(orgId, id);
			if (!deleted) {
				throw new ApiError(
					ApiErrorCode.NOT_FOUND,
					`Issue template ${id} not found`,
				);
			}
		},
	};
};

export type IssueTemplateService = ReturnType<
	typeof createIssueTemplateService
>;
