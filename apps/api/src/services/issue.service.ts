import {
	ApiError,
	ApiErrorCode,
	type CreateIssueInput,
	type ImportIssuesInput,
	ISSUE_CSV_EXPORT_HEADERS,
	ISSUE_CSV_MAX_EXPORT_ROWS,
	ISSUE_CSV_MAX_IMPORT_ROWS,
	ISSUE_PRIORITIES,
	type IssueImportResultDto,
	type IssueImportRowError,
	type IssueListQuery,
	isTerminalStatusCategory,
	normalizeIssueSorts,
	parseCsv,
	priorityName,
	serializeCsvText,
	type UpdateIssueInput,
	unescapeCsvCell,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { CycleDao } from "../dao/cycle.dao";
import type { IssueDao, IssueInsertData } from "../dao/issue.dao";
import type { LabelDao } from "../dao/label.dao";
import type { MemberDao } from "../dao/member.dao";
import type { ProjectDao } from "../dao/project.dao";
import type {
	IssueDetailDto,
	IssueDto,
	IssueExportResultDto,
	IssueLinkSummaryDto,
	IssueNavigationDto,
	IssueOverviewDto,
	ListIssuesDto,
	TriageListDto,
} from "../dto/issue.dto";
import type { StatusDto } from "../dto/status.dto";
import type { BackgroundFn } from "../lib/background";
import { assertCycleAssignable } from "./cycle.service";
import {
	bestEffortNotification,
	type NotificationService,
} from "./notification.service";
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

const toLinkSummary = (issue: IssueDto): IssueLinkSummaryDto => ({
	id: issue.id,
	orgId: issue.orgId,
	projectId: issue.projectId,
	number: issue.number,
	title: issue.title,
	statusId: issue.statusId,
	status: issue.status,
	priority: issue.priority,
	parentId: issue.parentId,
});

/** Issue key as displayed in activity history, e.g. `WEB-12`. */
export const issueKey = (projectKey: string, number: number) =>
	`${projectKey}-${number}`;

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
		(input.assigneeId ?? null) !== current.assigneeId
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

/**
 * Validates the two-level parent rule: the parent must exist in the same
 * organization/project, must not itself have a parent, and the issue being
 * reparented must not already have children (which would create a third level).
 */
export const assertValidParent = async ({
	issueDao,
	orgId,
	projectId,
	parentId,
	currentId,
}: {
	issueDao: Pick<IssueDao, "findById" | "hasChildren">;
	orgId: string;
	projectId: string;
	parentId: string;
	currentId?: string;
}): Promise<IssueDto> => {
	const parent = await issueDao.findById(orgId, parentId);
	if (!parent) {
		throw new ApiError(
			400,
			ApiErrorCode.ISSUE_PARENT_INVALID,
			"Parent issue does not exist in this organization",
		);
	}
	if (parent.projectId !== projectId) {
		throw new ApiError(
			400,
			ApiErrorCode.ISSUE_PARENT_INVALID,
			"Parent issue must belong to the same project",
		);
	}
	if (currentId && parent.id === currentId) {
		throw new ApiError(
			400,
			ApiErrorCode.ISSUE_PARENT_INVALID,
			"An issue cannot be its own parent",
		);
	}
	if (parent.parentId) {
		throw new ApiError(
			400,
			ApiErrorCode.ISSUE_PARENT_DEPTH,
			"Sub-issues cannot be nested more than two levels deep",
		);
	}
	if (currentId && (await issueDao.hasChildren(orgId, currentId))) {
		throw new ApiError(
			400,
			ApiErrorCode.ISSUE_PARENT_DEPTH,
			"An issue with sub-issues cannot become a sub-issue",
		);
	}
	return parent;
};

const nameKey = (value: string) => value.trim().toLowerCase();

const csvValue = (value: unknown) =>
	typeof value === "string" ? value.trim() : "";

/**
 * Reverses the spreadsheet-safety prefix added on export so a project's own
 * CSV re-imports unchanged (`'=1+1` becomes `=1+1` again).
 */
const unescapeImportRow = (
	row: Record<string, string>,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(row).map(([key, value]) => [key, unescapeCsvCell(value)]),
	);

/** `none|urgent|high|medium|low` or a numeric 0-4; null when unparseable. */
const parseImportPriority = (value: string): number | null => {
	if (!value) {
		return 0;
	}
	if (/^\d+$/.test(value)) {
		const numeric = Number(value);
		return numeric >= 0 && numeric <= 4 ? numeric : null;
	}
	const named = ISSUE_PRIORITIES.find(
		(priority) => priority.name === value.toLowerCase(),
	);
	return named?.value ?? null;
};

/** Accepts `YYYY-MM-DD` (UTC midnight) or any ISO-8601 timestamp. */
const parseImportDate = (value: string): Date | null => {
	if (!value) {
		return null;
	}
	const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
		? new Date(`${value}T00:00:00.000Z`)
		: new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

export const createIssueService = ({
	issueDao,
	labelDao,
	projectDao,
	memberDao,
	cycleDao,
	statusService,
	webhooks,
	notifications,
}: {
	issueDao: IssueDao;
	labelDao: LabelDao;
	projectDao: ProjectDao;
	memberDao: MemberDao;
	cycleDao: Pick<CycleDao, "findById" | "listAllByProject">;
	statusService: Pick<
		StatusService,
		"resolveStatus" | "resolveStatusIds" | "listStatuses"
	>;
	webhooks?: WebhookDispatcher;
	notifications?: Pick<
		NotificationService,
		"onIssueCreated" | "onIssueUpdated"
	>;
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
			sort: Array.isArray(query.sort) ? "updated" : query.sort,
			sorts: normalizeIssueSorts(query.sort),
			filter: query.filter,
			projectId: query.projectId,
			cycleId: query.cycleId,
			includeArchived: query.includeArchived,
		});
	},

	getIssue: async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<IssueOverviewDto & IssueNavigationDto> => {
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
		const [prevNumber, nextNumber, parent, children] = await Promise.all([
			issueDao.findPrevNumber(orgId, projectId, number),
			issueDao.findNextNumber(orgId, projectId, number),
			issue.parentId ? issueDao.findById(orgId, issue.parentId) : null,
			issueDao.findChildren(orgId, issue.id),
		]);
		const subIssues = children.map(toLinkSummary);
		// Progress counts every terminal category (completed *and* canceled),
		// matching how the rest of the app treats "done" work.
		const done = children.filter((child) =>
			isTerminalStatusCategory(child.status.category),
		).length;
		return {
			...issue,
			labelIds,
			prevNumber,
			nextNumber,
			parent: parent ? toLinkSummary(parent) : null,
			subIssues,
			subIssueProgress: { done, total: subIssues.length },
		};
	},

	/** Triage queue: backlog-category issues without an assignee. */
	listTriage: async (
		orgId: string,
		query: { projectId?: string } = {},
	): Promise<TriageListDto> => {
		if (query.projectId) {
			const project = await projectDao.findById(orgId, query.projectId);
			if (!project) {
				throw new ApiError(
					404,
					ApiErrorCode.PROJECT_NOT_FOUND,
					`Project ${query.projectId} not found`,
				);
			}
		}
		return { items: await issueDao.listTriage(orgId, query.projectId) };
	},

	/**
	 * Archives an issue: it disappears from lists, search, statistics and
	 * progress bars while the detail page stays reachable. Idempotent.
	 */
	archiveIssue: async (
		orgId: string,
		projectId: string,
		number: number,
		userId: string | null,
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
		if (issue.archivedAt) {
			return { ...issue, labelIds: await issueDao.findLabelIds(issue.id) };
		}
		const project = await projectDao.findById(orgId, issue.projectId);
		assertProjectWritable(project?.archived ?? true);
		const updated = await issueDao.setArchived(
			orgId,
			issue.id,
			new Date(),
			userId
				? buildActivity(
						orgId,
						issue.projectId,
						issue.id,
						userId,
						"issue.updated",
						{
							field: "archived",
							oldValue: null,
							newValue: "archived",
						},
					)
				: undefined,
		);
		if (!updated) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		const result = {
			...updated,
			labelIds: await issueDao.findLabelIds(issue.id),
		};
		await webhooks?.dispatch(orgId, "issue.updated", result, background);
		return result;
	},

	/** Restores an archived issue to every list/search/progress surface. */
	restoreIssue: async (
		orgId: string,
		projectId: string,
		number: number,
		userId: string | null,
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
		if (!issue.archivedAt) {
			return { ...issue, labelIds: await issueDao.findLabelIds(issue.id) };
		}
		const project = await projectDao.findById(orgId, issue.projectId);
		assertProjectWritable(project?.archived ?? true);
		const updated = await issueDao.setArchived(
			orgId,
			issue.id,
			null,
			userId
				? buildActivity(
						orgId,
						issue.projectId,
						issue.id,
						userId,
						"issue.updated",
						{
							field: "archived",
							oldValue: "archived",
							newValue: null,
						},
					)
				: undefined,
		);
		if (!updated) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		const result = {
			...updated,
			labelIds: await issueDao.findLabelIds(issue.id),
		};
		await webhooks?.dispatch(orgId, "issue.updated", result, background);
		return result;
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
		const parent = input.parentId
			? await assertValidParent({
					issueDao,
					orgId,
					projectId,
					parentId: input.parentId,
				})
			: null;
		if (input.cycleId) {
			await assertCycleAssignable(cycleDao, orgId, projectId, input.cycleId);
		}
		const id = crypto.randomUUID();
		const status = await statusService.resolveStatus(orgId, {
			statusId: input.statusId,
			statusName: input.status,
		});
		const activities: ActivityInsert[] = [];
		if (userId) {
			activities.push(
				buildActivity(orgId, projectId, id, userId, "issue.created"),
			);
			if (parent) {
				activities.push(
					buildActivity(orgId, projectId, id, userId, "issue.updated", {
						field: "parent",
						oldValue: null,
						newValue: issueKey(project.key, parent.number),
					}),
				);
			}
		}
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
				parentId: parent?.id ?? null,
				cycleId: input.cycleId ?? null,
			},
			labelIds,
			activities,
		);
		const result = { ...issue, labelIds };
		await bestEffortNotification("issue.created", () =>
			notifications?.onIssueCreated(result, userId ?? ""),
		);
		await webhooks?.dispatch(orgId, "issue.created", result, background);
		return result;
	},

	/**
	 * CSV export: active issues only (deleted and archived excluded), display
	 * order (number ascending). The assignee column carries the member display
	 * name (email is available on the members page, not in the export).
	 */
	exportIssues: async (
		orgId: string,
		projectId: string,
	): Promise<IssueExportResultDto> => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		const [statuses, labels, members, cycles, exported] = await Promise.all([
			statusService.listStatuses(orgId),
			labelDao.listByOrg(orgId),
			memberDao.listByOrg(orgId),
			cycleDao.listAllByProject(orgId, projectId),
			issueDao.listForExport(orgId, projectId, ISSUE_CSV_MAX_EXPORT_ROWS),
		]);
		const statusById = new Map(statuses.map((status) => [status.id, status]));
		const labelById = new Map(labels.map((label) => [label.id, label]));
		const memberById = new Map(
			members.map((member) => [member.userId, member.name]),
		);
		const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
		const labelIdsByIssue = new Map<string, string[]>();
		// One join query (not an IN list: 2000 ids would exceed D1's parameter
		// limit), then grouped locally.
		const links = await issueDao.listLabelLinksForProject(orgId, projectId);
		for (const link of links) {
			const list = labelIdsByIssue.get(link.issueId) ?? [];
			list.push(link.labelId);
			labelIdsByIssue.set(link.issueId, list);
		}
		const data = exported.rows.map((row) => {
			const status = statusById.get(row.statusId);
			if (!status) {
				throw new Error(`Issue ${row.id} references unknown status`);
			}
			const labelNames = (labelIdsByIssue.get(row.id) ?? [])
				.map((labelId) => labelById.get(labelId)?.name)
				.filter((name): name is string => Boolean(name))
				.sort((a, b) => a.localeCompare(b));
			return [
				issueKey(project.key, row.number),
				project.name,
				row.title,
				row.description ?? "",
				status.name,
				priorityName(row.priority),
				row.assigneeId ? (memberById.get(row.assigneeId) ?? "") : "",
				labelNames.join(", "),
				row.dueDate ? row.dueDate.toISOString().slice(0, 10) : "",
				row.estimate === null ? "" : String(row.estimate),
				row.cycleId ? (cycleById.get(row.cycleId)?.name ?? "") : "",
				row.createdAt.toISOString(),
				row.updatedAt.toISOString(),
			];
		});
		return {
			csv: serializeCsvText([[...ISSUE_CSV_EXPORT_HEADERS], ...data]),
			filename: `${project.key.replace(/[^A-Za-z0-9._-]/g, "_")}-issues.csv`,
			exported: exported.rows.length,
			total: exported.total,
			truncated: exported.total > exported.rows.length,
		};
	},

	/**
	 * CSV import with partial success: invalid rows are reported by 1-based
	 * data-row index (header excluded) and skipped, valid rows are inserted in
	 * one transaction with contiguous numbers. Status/assignee/label/cycle
	 * values resolve by name against the organization's current data.
	 */
	importIssues: async (
		orgId: string,
		projectId: string,
		userId: string | null,
		input: ImportIssuesInput,
	): Promise<IssueImportResultDto> => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		assertProjectWritable(project.archived);
		if (input.rows.length > ISSUE_CSV_MAX_IMPORT_ROWS) {
			throw new ApiError(
				400,
				ApiErrorCode.VALIDATION,
				`An import can contain at most ${ISSUE_CSV_MAX_IMPORT_ROWS} rows`,
			);
		}
		const [statuses, labels, members, cycles] = await Promise.all([
			statusService.listStatuses(orgId),
			labelDao.listByOrg(orgId),
			memberDao.listByOrg(orgId),
			cycleDao.listAllByProject(orgId, projectId),
		]);
		const statusByKey = new Map(
			statuses.map((status) => [nameKey(status.name), status]),
		);
		const defaultStatus =
			statuses.find((status) => status.isDefault) ?? statuses[0] ?? null;
		const labelsByKey = new Map<string, string[]>();
		for (const label of labels) {
			const key = nameKey(label.name);
			labelsByKey.set(key, [...(labelsByKey.get(key) ?? []), label.id]);
		}
		const membersByEmail = new Map(
			members.map((member) => [nameKey(member.email), member]),
		);
		const membersByName = new Map<string, typeof members>();
		for (const member of members) {
			const key = nameKey(member.name);
			membersByName.set(key, [...(membersByName.get(key) ?? []), member]);
		}
		const cyclesByName = new Map<string, typeof cycles>();
		for (const cycle of cycles) {
			const key = nameKey(cycle.name);
			cyclesByName.set(key, [...(cyclesByName.get(key) ?? []), cycle]);
		}

		const errors: IssueImportRowError[] = [];
		const inserts: IssueInsertData[] = [];
		const labelLinks: { issueId: string; labelId: string }[] = [];
		const activities: ActivityInsert[] = [];
		const invalid = (message: string): never => {
			throw new Error(message);
		};

		input.rows.forEach((rawRow, index) => {
			const row = index + 1;
			try {
				const raw = unescapeImportRow(rawRow);
				const title = csvValue(raw.title);
				if (!title) {
					invalid("Title is required");
				}
				if (title.length > 500) {
					invalid("Title must be at most 500 characters");
				}
				const description = csvValue(raw.description);
				if (description.length > 20000) {
					invalid("Description must be at most 20000 characters");
				}
				const statusName = csvValue(raw.status);
				const status = statusName
					? statusByKey.get(nameKey(statusName))
					: defaultStatus;
				if (!status) {
					throw new Error(
						statusName
							? `Unknown status "${statusName}"`
							: "This organization has no workflow status",
					);
				}
				const priorityInput = csvValue(raw.priority);
				const priority = parseImportPriority(priorityInput);
				if (priority === null) {
					throw new Error(
						`Invalid priority "${priorityInput}" (use none/urgent/high/medium/low or 0-4)`,
					);
				}
				let assigneeId: string | null = null;
				const assigneeInput = csvValue(raw.assignee);
				if (assigneeInput) {
					const key = nameKey(assigneeInput);
					const byEmail = membersByEmail.get(key);
					const byName = membersByName.get(key) ?? [];
					if (byEmail) {
						assigneeId = byEmail.userId;
					} else if (byName.length === 1) {
						assigneeId = byName[0].userId;
					} else if (byName.length > 1) {
						invalid(
							`Assignee "${assigneeInput}" is ambiguous; use the email address`,
						);
					} else {
						invalid(`Unknown assignee "${assigneeInput}"`);
					}
				}
				const labelIds: string[] = [];
				for (const labelName of parseCsv(raw.labels)) {
					const matches = labelsByKey.get(nameKey(labelName)) ?? [];
					if (matches.length === 0) {
						invalid(`Unknown label "${labelName}"`);
					}
					const labelId = matches[0];
					if (!labelIds.includes(labelId)) {
						labelIds.push(labelId);
					}
					if (labelIds.length > 20) {
						invalid("At most 20 labels are allowed per issue");
					}
				}
				const dueDateInput = csvValue(raw.due_date);
				const dueDate = parseImportDate(dueDateInput);
				if (dueDateInput && !dueDate) {
					invalid(`Invalid due_date "${dueDateInput}" (use YYYY-MM-DD)`);
				}
				const estimateInput = csvValue(raw.estimate);
				let estimate: number | null = null;
				if (estimateInput) {
					if (!/^\d+$/.test(estimateInput)) {
						invalid("estimate must be a whole number between 0 and 100");
					}
					estimate = Number(estimateInput);
					if (estimate > 100) {
						invalid("estimate must be a whole number between 0 and 100");
					}
				}
				let cycleId: string | null = null;
				const cycleInput = csvValue(raw.cycle);
				if (cycleInput) {
					const matches = cyclesByName.get(nameKey(cycleInput)) ?? [];
					if (matches.length === 0) {
						invalid(`Unknown cycle "${cycleInput}"`);
					}
					cycleId = matches[0].id;
				}
				const id = crypto.randomUUID();
				inserts.push({
					id,
					orgId,
					projectId,
					title,
					description: description || null,
					statusId: status.id,
					priority,
					assigneeId,
					createdById: userId,
					dueDate,
					estimate,
					parentId: null,
					cycleId,
				});
				for (const labelId of labelIds) {
					labelLinks.push({ issueId: id, labelId });
				}
				if (userId) {
					activities.push(
						buildActivity(orgId, projectId, id, userId, "issue.created"),
					);
				}
			} catch (err) {
				errors.push({
					row,
					message: err instanceof Error ? err.message : "Invalid row",
				});
			}
		});

		if (inserts.length > 0) {
			await issueDao.createManyWithNumbers(
				orgId,
				projectId,
				inserts,
				labelLinks,
				activities,
			);
		}
		return { created: inserts.length, errors };
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
		if (input.cycleId) {
			await assertCycleAssignable(
				cycleDao,
				orgId,
				issue.projectId,
				input.cycleId,
			);
		}
		const resolvedStatus =
			input.statusId !== undefined || input.status !== undefined
				? await statusService.resolveStatus(orgId, {
						statusId: input.statusId,
						statusName: input.status,
					})
				: undefined;
		const diffs = computeIssueDiff(current, input, resolvedStatus);
		const parentChanged =
			"parentId" in input &&
			input.parentId !== undefined &&
			input.parentId !== (issue.parentId ?? null);
		if (parentChanged) {
			const oldParent = issue.parentId
				? await issueDao.findById(orgId, issue.parentId)
				: null;
			const oldValue = oldParent
				? issueKey(project?.key ?? "", oldParent.number)
				: null;
			if (input.parentId) {
				const parent = await assertValidParent({
					issueDao,
					orgId,
					projectId: issue.projectId,
					parentId: input.parentId,
					currentId: issue.id,
				});
				diffs.push({
					field: "parent",
					oldValue,
					newValue: issueKey(project?.key ?? "", parent.number),
				});
			} else {
				diffs.push({ field: "parent", oldValue, newValue: null });
			}
		}
		const statusChanged = diffs.some((diff) => diff.field === "status");
		const cycleChanged =
			"cycleId" in input &&
			input.cycleId !== undefined &&
			(input.cycleId ?? null) !== (issue.cycleId ?? null);
		if (cycleChanged) {
			// Activities store cycle *names* so history survives cycle deletion.
			const oldCycle = issue.cycleId
				? await cycleDao.findById(orgId, issue.cycleId)
				: null;
			const newCycle = input.cycleId
				? await cycleDao.findById(orgId, input.cycleId)
				: null;
			diffs.push({
				field: "cycle",
				oldValue: oldCycle?.name ?? null,
				newValue: newCycle?.name ?? null,
			});
		}
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
				parentId: "parentId" in input ? input.parentId : undefined,
				cycleId: "cycleId" in input ? input.cycleId : undefined,
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
		if (userId) {
			const assigneeChanged = diffs.some((diff) => diff.field === "assigneeId");
			await bestEffortNotification("issue.updated", () =>
				notifications?.onIssueUpdated({
					issue: result,
					actorId: userId,
					statusChanged,
					assignedUserId:
						assigneeChanged && updated.assigneeId ? updated.assigneeId : null,
				}),
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
