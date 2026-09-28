import {
	ApiError,
	ApiErrorCode,
	type CreateIssueInput,
	type IssueListQuery,
	type UpdateIssueInput,
} from "@workspace/shared";
import type { IssueDao } from "../dao/issue.dao";
import type { LabelDao } from "../dao/label.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { IssueDetailDto, ListIssuesDto } from "../dto/issue.dto";

const toDueDate = (
	value: string | null | undefined,
): Date | null | undefined =>
	value === undefined ? undefined : value === null ? null : new Date(value);

export const createIssueService = ({
	issueDao,
	labelDao,
	projectDao,
}: {
	issueDao: IssueDao;
	labelDao: LabelDao;
	projectDao: ProjectDao;
}) => ({
	listIssues: (
		orgId: string,
		projectId: string | null,
		query: IssueListQuery,
	): Promise<ListIssuesDto> => issueDao.list(orgId, projectId, query),

	getIssue: async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<IssueDetailDto> => {
		const issue = await issueDao.findByProjectAndNumber(
			orgId,
			projectId,
			number,
		);
		if (!issue) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		const labelIds = await issueDao.findLabelIds(issue.id);
		return { ...issue, labelIds };
	},

	createIssue: async (
		orgId: string,
		projectId: string,
		userId: string,
		input: CreateIssueInput,
	): Promise<IssueDetailDto> => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		if (input.labelIds?.length) {
			const found = await labelDao.findByIds(orgId, input.labelIds);
			if (found.length !== input.labelIds.length) {
				throw new ApiError(
					404,
					ApiErrorCode.LABEL_NOT_FOUND,
					"One or more labels do not exist in this organization",
				);
			}
		}
		const issue = await issueDao.createWithNumber({
			id: crypto.randomUUID(),
			orgId,
			projectId,
			title: input.title,
			description: input.description ?? null,
			status: input.status ?? "backlog",
			priority: input.priority ?? 0,
			assigneeId: input.assigneeId ?? null,
			createdById: userId,
			dueDate: input.dueDate ? new Date(input.dueDate) : null,
			estimate: input.estimate ?? null,
		});
		const labelIds = input.labelIds?.length ? input.labelIds : [];
		if (labelIds.length > 0) {
			await issueDao.replaceLabels(issue.id, labelIds);
		}
		return { ...issue, labelIds };
	},

	updateIssue: async (
		orgId: string,
		projectId: string,
		number: number,
		input: UpdateIssueInput,
	): Promise<IssueDetailDto> => {
		const issue = await issueDao.findByProjectAndNumber(
			orgId,
			projectId,
			number,
		);
		if (!issue) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		if (input.labelIds) {
			const found = await labelDao.findByIds(orgId, input.labelIds);
			if (found.length !== input.labelIds.length) {
				throw new ApiError(
					404,
					ApiErrorCode.LABEL_NOT_FOUND,
					"One or more labels do not exist in this organization",
				);
			}
		}
		const updated = await issueDao.update(orgId, issue.id, {
			title: input.title,
			description: "description" in input ? input.description : undefined,
			status: input.status,
			priority: "priority" in input ? (input.priority ?? 0) : undefined,
			assigneeId: "assigneeId" in input ? input.assigneeId : undefined,
			dueDate: "dueDate" in input ? toDueDate(input.dueDate) : undefined,
			estimate: "estimate" in input ? input.estimate : undefined,
		});
		if (!updated) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		if (input.labelIds) {
			await issueDao.replaceLabels(issue.id, input.labelIds);
		}
		const labelIds = await issueDao.findLabelIds(issue.id);
		return { ...updated, labelIds };
	},

	deleteIssue: async (orgId: string, projectId: string, number: number) => {
		const issue = await issueDao.findByProjectAndNumber(
			orgId,
			projectId,
			number,
		);
		if (!issue) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		await issueDao.softDelete(orgId, issue.id);
	},
});

export type IssueService = ReturnType<typeof createIssueService>;
