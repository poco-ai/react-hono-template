import {
	ApiError,
	ApiErrorCode,
	type CreateIssueInput,
	type IssueListQuery,
	type UpdateIssueInput,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { LabelDao } from "../dao/label.dao";
import type { MemberDao } from "../dao/member.dao";
import type { ProjectDao } from "../dao/project.dao";
import type {
	IssueDetailDto,
	IssueNavigationDto,
	ListIssuesDto,
} from "../dto/issue.dto";
import type { StatusDto } from "../dto/status.dto";
import type { BackgroundFn } from "../lib/background";
import type { StatusService } from "./status.service";
import type { WebhookDispatcher } from "./webhook-delivery.service";

const toDueDate = (
	value: string | null | undefined,
): Date | null | undefined =>
	value === undefined ? undefined : value === null ? null : new Date(value);

const assertProjectWritable = (archived: boolean) => {
	if (archived) {
		throw new ApiError(
			409,
			ApiErrorCode.PROJECT_ARCHIVED,
			"Project is archived and read-only",
		);
	}
};

export type IssueFieldDiff = {
	field: string;
	oldValue: string | null;
	newValue: string | null;
};

export const computeIssueDiff = (
	current: IssueDetailDto,
	input: UpdateIssueInput,
	resolvedStatus?: StatusDto,
): IssueFieldDiff[] => {
	const diffs: IssueFieldDiff[] = [];
	if (input.title !== undefined && input.title !== current.title) {
		diffs.push({
			field: "title",
			oldValue: current.title,
			newValue: input.title,
		});
	}
	if (
		"description" in input &&
		input.description !== undefined &&
		input.description !== (current.description ?? null)
	) {
		diffs.push({ field: "description", oldValue: null, newValue: null });
	}
	// Activities store status *names* so history does not drift when a status
	// is renamed later.
	if (resolvedStatus && resolvedStatus.id !== current.statusId) {
		diffs.push({
			field: "status",
			oldValue: current.status.name,
			newValue: resolvedStatus.name,
		});
	}
	if (
		"priority" in input &&
		input.priority !== undefined &&
		input.priority !== current.priority
	) {
		diffs.push({
			field: "priority",
			oldValue: String(current.priority),
			newValue: String(input.priority ?? 0),
		});
	}
	if (
		"assigneeId" in input &&
		input.assigneeId !== undefined &&
		input.assigneeId !== (current.assigneeId ?? "")
	) {
		diffs.push({
			field: "assigneeId",
			oldValue: current.assigneeId ?? "",
			newValue: input.assigneeId ?? "",
		});
	}
	if ("dueDate" in input && input.dueDate !== undefined) {
		const oldDue = current.dueDate ? Date.parse(current.dueDate) : null;
		const newDue = input.dueDate ? Date.parse(input.dueDate) : null;
		if (oldDue !== newDue) {
			diffs.push({
				field: "dueDate",
				oldValue: current.dueDate ?? "",
				newValue: input.dueDate ?? "",
			});
		}
	}
	if (
		"estimate" in input &&
		input.estimate !== undefined &&
		input.estimate !== current.estimate
	) {
		diffs.push({
			field: "estimate",
			oldValue: current.estimate != null ? String(current.estimate) : "",
			newValue: input.estimate != null ? String(input.estimate) : "",
		});
	}
	if (input.labelIds) {
		const oldValue = [...current.labelIds].sort().join(",");
		const newValue = [...input.labelIds].sort().join(",");
		if (oldValue !== newValue) {
			diffs.push({ field: "labels", oldValue, newValue });
		}
	}
	return diffs;
};

const buildActivity = (
	orgId: string,
	projectId: string,
	issueId: string,
	actorId: string,
	action: string,
	diff?: IssueFieldDiff,
): ActivityInsert => ({
	id: crypto.randomUUID(),
	orgId,
	projectId,
	issueId,
	actorId,
	action,
	field: diff?.field ?? null,
	oldValue: diff?.oldValue ?? null,
	newValue: diff?.newValue ?? null,
});

export const createIssueService = ({
	issueDao,
	labelDao,
	projectDao,
	memberDao,
	statusService,
	webhooks,
}: {
	issueDao: IssueDao;
	labelDao: LabelDao;
	projectDao: ProjectDao;
	memberDao: MemberDao;
	statusService: Pick<StatusService, "resolveStatus" | "resolveStatusIds">;
	webhooks?: WebhookDispatcher;
}) => ({
	listIssues: async (
		orgId: string,
		projectId: string | null,
		query: IssueListQuery,
	): Promise<ListIssuesDto> => {
		const statusId = await statusService.resolveStatusIds(orgId, {
			statusIds: query.statusId,
			statusNames: query.status,
		});
		return issueDao.list(orgId, projectId, {
			page: query.page,
			pageSize: query.pageSize,
			statusId: statusId.length > 0 ? statusId : undefined,
			priority: query.priority,
			assigneeId: query.assigneeId,
			labelId: query.labelId,
			search: query.search,
			sort: query.sort,
			projectId: query.projectId,
		});
	},

	getIssue: async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<IssueDetailDto & IssueNavigationDto> => {
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
		const [prevNumber, nextNumber] = await Promise.all([
			issueDao.findPrevNumber(orgId, projectId, number),
			issueDao.findNextNumber(orgId, projectId, number),
		]);
		return { ...issue, labelIds, prevNumber, nextNumber };
	},

	getIssueById: async (
		orgId: string,
		issueId: string,
	): Promise<IssueDetailDto> => {
		const issue = await issueDao.findById(orgId, issueId);
		if (!issue) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue ${issueId} not found`,
			);
		}
		const labelIds = await issueDao.findLabelIds(issue.id);
		return { ...issue, labelIds };
	},

	createIssue: async (
		orgId: string,
		projectId: string,
		userId: string | null,
		input: CreateIssueInput,
		background?: BackgroundFn,
	): Promise<IssueDetailDto> => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		assertProjectWritable(project.archived);
		const labelIds = input.labelIds ?? [];
		if (labelIds.length > 0) {
			const found = await labelDao.findByIds(orgId, labelIds);
			if (found.length !== labelIds.length) {
				throw new ApiError(
					404,
					ApiErrorCode.LABEL_NOT_FOUND,
					"One or more labels do not exist in this organization",
				);
			}
		}
		if (input.assigneeId) {
			const member = await memberDao.findByOrgAndUser(orgId, input.assigneeId);
			if (!member) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Assignee must be a member of this organization",
				);
			}
		}
		const id = crypto.randomUUID();
		const status = await statusService.resolveStatus(orgId, {
			statusId: input.statusId,
			statusName: input.status,
		});
		const issue = await issueDao.createWithNumber(
			{
				id,
				orgId,
				projectId,
				title: input.title,
				description: input.description ?? null,
				statusId: status.id,
				priority: input.priority ?? 0,
				assigneeId: input.assigneeId ?? null,
				createdById: userId,
				dueDate: input.dueDate ? new Date(input.dueDate) : null,
				estimate: input.estimate ?? null,
			},
			labelIds,
			userId
				? buildActivity(orgId, projectId, id, userId, "issue.created")
				: undefined,
		);
		const result = { ...issue, labelIds };
		await webhooks?.dispatch(orgId, "issue.created", result, background);
		return result;
	},

	updateIssue: async (
		orgId: string,
		projectId: string,
		number: number,
		userId: string | null,
		input: UpdateIssueInput,
		background?: BackgroundFn,
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
		const project = await projectDao.findById(orgId, issue.projectId);
		assertProjectWritable(project?.archived ?? true);
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
		if (input.assigneeId) {
			const member = await memberDao.findByOrgAndUser(orgId, input.assigneeId);
			if (!member) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Assignee must be a member of this organization",
				);
			}
		}
		const currentLabelIds = await issueDao.findLabelIds(issue.id);
		const current: IssueDetailDto = { ...issue, labelIds: currentLabelIds };
		const resolvedStatus =
			input.statusId !== undefined || input.status !== undefined
				? await statusService.resolveStatus(orgId, {
						statusId: input.statusId,
						statusName: input.status,
					})
				: undefined;
		const diffs = computeIssueDiff(current, input, resolvedStatus);
		const statusChanged = diffs.some((diff) => diff.field === "status");
		const activityRows = userId
			? diffs.map((diff) =>
					buildActivity(
						orgId,
						issue.projectId,
						issue.id,
						userId,
						"issue.updated",
						diff,
					),
				)
			: [];
		const updated = await issueDao.update(
			orgId,
			issue.id,
			{
				title: input.title,
				description: "description" in input ? input.description : undefined,
				statusId: resolvedStatus?.id,
				priority: "priority" in input ? (input.priority ?? 0) : undefined,
				assigneeId: "assigneeId" in input ? input.assigneeId : undefined,
				dueDate: "dueDate" in input ? toDueDate(input.dueDate) : undefined,
				estimate: "estimate" in input ? input.estimate : undefined,
			},
			input.labelIds,
			activityRows,
		);
		if (!updated) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		const labelIds = await issueDao.findLabelIds(issue.id);
		const result = { ...updated, labelIds };
		if (diffs.length > 0) {
			await webhooks?.dispatch(orgId, "issue.updated", result, background);
		}
		if (statusChanged) {
			await webhooks?.dispatch(
				orgId,
				"issue.status_changed",
				{
					issue: result,
					previousStatus: issue.status.name,
					previousStatusId: issue.statusId,
					// Top-level aliases keep older consumers working while the
					// status object carries the full workflow status.
					statusId: updated.statusId,
					statusName: updated.status.name,
					status: updated.status,
				},
				background,
			);
		}
		return result;
	},

	deleteIssue: async (
		orgId: string,
		projectId: string,
		number: number,
		userId: string | null,
		background?: BackgroundFn,
	) => {
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
		const project = await projectDao.findById(orgId, issue.projectId);
		assertProjectWritable(project?.archived ?? true);
		await issueDao.softDelete(
			orgId,
			issue.id,
			userId
				? buildActivity(
						orgId,
						issue.projectId,
						issue.id,
						userId,
						"issue.deleted",
					)
				: undefined,
		);
		await webhooks?.dispatch(orgId, "issue.deleted", issue, background);
	},
});

export type IssueService = ReturnType<typeof createIssueService>;
