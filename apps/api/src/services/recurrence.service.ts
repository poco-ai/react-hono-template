import {
	ApiError,
	ApiErrorCode,
	type CreateRecurrenceInput,
	type RecurrenceCadence,
	type UpdateRecurrenceInput,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { LabelDao } from "../dao/label.dao";
import type { MemberDao } from "../dao/member.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { RecurrenceDao } from "../dao/recurrence.dao";
import type { RecurrenceDto } from "../dto/recurrence.dto";
import type { BackgroundFn } from "../lib/background";
import {
	bestEffortNotification,
	type NotificationService,
} from "./notification.service";
import type { StatusService } from "./status.service";
import type { WebhookDispatcher } from "./webhook-delivery.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const addOneMonthClamped = (date: Date, anchorDay: number): Date => {
	const next = new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth() + 1,
			1,
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds(),
			date.getUTCMilliseconds(),
		),
	);
	// Clamp to the target month's last day (Jan 31 → Feb 28/29). The anchor day
	// is reused next time, so the March run goes back to the 31st.
	const lastDay = new Date(
		Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
	).getUTCDate();
	next.setUTCDate(Math.min(anchorDay, lastDay));
	return next;
};

export const addCadence = (
	cadence: RecurrenceCadence,
	date: Date,
	anchorDay: number = date.getUTCDate(),
): Date => {
	switch (cadence) {
		case "daily":
			return new Date(date.getTime() + DAY_MS);
		case "weekly":
			return new Date(date.getTime() + 7 * DAY_MS);
		case "monthly":
			return addOneMonthClamped(date, anchorDay);
	}
};

/**
 * Advances from the *scheduled* time, not from `now`, so a run that fires a
 * little late keeps its time of day. Missed periods are skipped: the result is
 * always strictly after `now`, and only one issue is created per tick.
 * `anchorDay` keeps monthly schedules on their original day of the month.
 */
export const advanceNextRunAt = (
	cadence: RecurrenceCadence,
	scheduledAt: Date,
	now: Date,
	anchorDay: number = scheduledAt.getUTCDate(),
): Date => {
	let next = addCadence(cadence, scheduledAt, anchorDay);
	while (next.getTime() <= now.getTime()) {
		next = addCadence(cadence, next, anchorDay);
	}
	return next;
};

const isFuture = (value: string, now: Date) =>
	Date.parse(value) > now.getTime();

export type RecurrenceProcessResult = {
	created: number;
	skipped: number;
	failed: number;
};

export const createRecurrenceService = ({
	recurrenceDao,
	issueDao,
	projectDao,
	labelDao,
	memberDao,
	statusService,
	notifications,
	webhooks,
	now = () => new Date(),
}: {
	recurrenceDao: RecurrenceDao;
	issueDao: Pick<IssueDao, "findById" | "findLabelIds" | "createWithNumber">;
	projectDao: Pick<ProjectDao, "findById">;
	labelDao: Pick<LabelDao, "findByIds">;
	memberDao: Pick<MemberDao, "findByOrgAndUser" | "isOrgFrozen">;
	statusService: Pick<StatusService, "resolveStatus">;
	notifications?: Pick<NotificationService, "onRecurrenceCreated">;
	webhooks?: WebhookDispatcher;
	now?: () => Date;
}) => {
	const assertProject = async (orgId: string, projectId: string) => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project) {
			throw new ApiError(
				404,
				ApiErrorCode.PROJECT_NOT_FOUND,
				`Project ${projectId} not found`,
			);
		}
		return project;
	};

	const assertProjectWritable = (archived: boolean) => {
		if (archived) {
			throw new ApiError(
				409,
				ApiErrorCode.PROJECT_ARCHIVED,
				"Project is archived and read-only",
			);
		}
	};

	const validateSnapshot = async (
		orgId: string,
		input: {
			statusId?: string | null;
			assigneeId?: string | null;
			labelIds?: string[];
		},
	) => {
		if (input.statusId) {
			await statusService.resolveStatus(orgId, { statusId: input.statusId });
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
		return { labelIds };
	};

	const createIssueFor = async (recurrence: RecurrenceDto) => {
		const status = await statusService.resolveStatus(recurrence.orgId, {
			statusId: recurrence.statusId ?? undefined,
		});
		// Labels deleted since the snapshot must not fail the insert.
		const existingLabels = await labelDao.findByIds(
			recurrence.orgId,
			recurrence.labelIds,
		);
		const labelIds = existingLabels.map((label) => label.id);
		const issueId = crypto.randomUUID();
		const activities: ActivityInsert[] = recurrence.createdById
			? [
					{
						id: crypto.randomUUID(),
						orgId: recurrence.orgId,
						projectId: recurrence.projectId,
						issueId,
						actorId: recurrence.createdById,
						action: "created",
						field: null,
						oldValue: null,
						newValue: null,
						source: "recurrence",
						sourceId: recurrence.id,
					},
				]
			: [];
		return issueDao.createWithNumber(
			{
				id: issueId,
				orgId: recurrence.orgId,
				projectId: recurrence.projectId,
				title: recurrence.title,
				description: recurrence.description,
				statusId: status.id,
				priority: recurrence.priority,
				assigneeId: recurrence.assigneeId,
				createdById: recurrence.createdById,
				dueDate: null,
				estimate: recurrence.estimate,
				parentId: null,
				cycleId: null,
			},
			labelIds,
			activities,
		);
	};

	return {
		listRecurrences: async (
			orgId: string,
			projectId: string,
		): Promise<RecurrenceDto[]> => {
			await assertProject(orgId, projectId);
			return recurrenceDao.listByProject(orgId, projectId);
		},

		createRecurrence: async (
			orgId: string,
			projectId: string,
			userId: string | null,
			input: CreateRecurrenceInput,
		): Promise<RecurrenceDto> => {
			const project = await assertProject(orgId, projectId);
			assertProjectWritable(project.archived);
			const current = now();
			if (!isFuture(input.nextRunAt, current)) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"nextRunAt must be in the future",
				);
			}

			// Snapshot the source issue once; later edits or deletion of the issue
			// do not affect this recurrence.
			let source: {
				title: string;
				description: string | null;
				statusId: string;
				priority: number;
				assigneeId: string | null;
				estimate: number | null;
				labelIds: string[];
			} | null = null;
			if (input.issueId) {
				const issue = await issueDao.findById(orgId, input.issueId);
				if (!issue || issue.projectId !== projectId) {
					throw new ApiError(
						404,
						ApiErrorCode.ISSUE_NOT_FOUND,
						`Issue ${input.issueId} not found in this project`,
					);
				}
				source = {
					title: issue.title,
					description: issue.description,
					statusId: issue.statusId,
					priority: issue.priority,
					assigneeId: issue.assigneeId,
					estimate: issue.estimate,
					labelIds: await issueDao.findLabelIds(issue.id),
				};
			}

			const title = input.title ?? source?.title;
			if (!title) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"title is required unless issueId is provided",
				);
			}
			const statusId =
				input.statusId !== undefined
					? input.statusId
					: (source?.statusId ?? null);
			const assigneeId =
				input.assigneeId !== undefined
					? input.assigneeId
					: (source?.assigneeId ?? null);
			const labelIds = input.labelIds ?? source?.labelIds ?? [];
			const { labelIds: validatedLabelIds } = await validateSnapshot(orgId, {
				statusId,
				assigneeId,
				labelIds,
			});

			return recurrenceDao.create({
				id: crypto.randomUUID(),
				orgId,
				projectId,
				title,
				description:
					input.description !== undefined
						? (input.description ?? null)
						: (source?.description ?? null),
				statusId: statusId ?? null,
				priority: input.priority ?? source?.priority ?? 0,
				assigneeId: assigneeId ?? null,
				labelIds: validatedLabelIds,
				estimate:
					input.estimate !== undefined
						? (input.estimate ?? null)
						: (source?.estimate ?? null),
				cadence: input.cadence,
				nextRunAt: new Date(input.nextRunAt),
				// Monthly schedules keep the day-of-month of the first run.
				anchorDay: new Date(input.nextRunAt).getUTCDate(),
				createdById: userId,
			});
		},

		updateRecurrence: async (
			orgId: string,
			projectId: string,
			id: string,
			input: UpdateRecurrenceInput,
		): Promise<RecurrenceDto> => {
			const recurrence = await recurrenceDao.findById(orgId, projectId, id);
			if (!recurrence) {
				throw new ApiError(
					404,
					ApiErrorCode.NOT_FOUND,
					`Recurrence ${id} not found`,
				);
			}
			const project = await assertProject(orgId, projectId);
			assertProjectWritable(project.archived);
			if (input.nextRunAt && !isFuture(input.nextRunAt, now())) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"nextRunAt must be in the future",
				);
			}
			const patch = {
				cadence: input.cadence,
				active: input.active,
				nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : undefined,
				// Rescheduling re-anchors monthly runs to the new day.
				anchorDay: input.nextRunAt
					? new Date(input.nextRunAt).getUTCDate()
					: undefined,
			};
			// An empty PATCH is a no-op, not a missing row: return the current
			// recurrence instead of letting the DAO answer null (404).
			if (Object.values(patch).every((value) => value === undefined)) {
				return recurrence;
			}
			const updated = await recurrenceDao.update(orgId, projectId, id, patch);
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.NOT_FOUND,
					`Recurrence ${id} not found`,
				);
			}
			return updated;
		},

		deleteRecurrence: async (
			orgId: string,
			projectId: string,
			id: string,
		): Promise<void> => {
			const deleted = await recurrenceDao.remove(orgId, projectId, id);
			if (!deleted) {
				throw new ApiError(
					404,
					ApiErrorCode.NOT_FOUND,
					`Recurrence ${id} not found`,
				);
			}
		},

		/**
		 * Cron entry point. Claims each due recurrence before creating its issue
		 * so concurrent workers cannot double-create, then advances the schedule.
		 * Frozen organizations and archived projects skip the run instead of
		 * deactivating it, so the recurrence resumes after unfreeze/unarchive.
		 * If issue creation fails the claim is rolled back, keeping the run due
		 * for the next tick. Per-recurrence failures are logged and never abort
		 * the remaining rows. Notifications and the `issue.created` webhook are
		 * best-effort side effects fired after the issue exists: neither can
		 * roll back the claim nor fail the tick.
		 */
		processDue: async (
			at: Date = now(),
			background?: BackgroundFn,
			limit?: number,
		): Promise<RecurrenceProcessResult> => {
			const due = await recurrenceDao.listDue(at, limit);
			const result: RecurrenceProcessResult = {
				created: 0,
				skipped: 0,
				failed: 0,
			};
			for (const recurrence of due) {
				try {
					const project = await projectDao.findById(
						recurrence.orgId,
						recurrence.projectId,
					);
					const frozen = project
						? await memberDao.isOrgFrozen(recurrence.orgId)
						: false;
					if (!project || project.archived || frozen) {
						console.log(
							`[recurrence] skipped ${recurrence.id}: ${
								!project
									? "project missing"
									: frozen
										? "organization frozen"
										: "project archived"
							}`,
						);
						result.skipped++;
						continue;
					}

					const observed = new Date(recurrence.nextRunAt);
					const nextRunAt = advanceNextRunAt(
						recurrence.cadence,
						observed,
						at,
						recurrence.anchorDay,
					);
					const previousLastRunAt = recurrence.lastRunAt
						? new Date(recurrence.lastRunAt)
						: null;
					const claimed = await recurrenceDao.claim(
						recurrence.id,
						observed,
						nextRunAt,
						at,
					);
					if (!claimed) {
						result.skipped++;
						continue;
					}

					let created: Awaited<ReturnType<typeof createIssueFor>>;
					try {
						created = await createIssueFor(recurrence);
					} catch (err) {
						// Give the run back so the next tick retries it instead of
						// silently losing one occurrence.
						await recurrenceDao.rollbackClaim(
							recurrence.id,
							nextRunAt,
							observed,
							previousLastRunAt,
						);
						throw err;
					}
					result.created++;
					await bestEffortNotification("recurrence.created", () =>
						notifications?.onRecurrenceCreated(
							created,
							recurrence.createdById ?? "",
						),
					);
					try {
						await webhooks?.dispatch(
							recurrence.orgId,
							"issue.created",
							created,
							background,
						);
					} catch (err) {
						console.error(
							`[recurrence] webhook dispatch failed for ${recurrence.id}:`,
							err,
						);
					}
				} catch (err) {
					result.failed++;
					console.error(
						`[recurrence] failed to process ${recurrence.id}:`,
						err,
					);
				}
			}
			return result;
		},

		createIssueFor,
	};
};

export type RecurrenceService = ReturnType<typeof createRecurrenceService>;
