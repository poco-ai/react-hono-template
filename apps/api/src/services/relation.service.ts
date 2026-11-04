import {
	ApiError,
	ApiErrorCode,
	type CreateIssueRelationInput,
	type IssueRelationType,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { RelationDao } from "../dao/relation.dao";
import type { IssueDto } from "../dto/issue.dto";
import type {
	IssueRelationDto,
	IssueRelationLinkDto,
	IssueRelationsDto,
} from "../dto/relation.dto";
import type { BackgroundFn } from "../lib/background";
import { issueKey } from "./issue.service";
import type { WebhookDispatcher } from "./webhook-delivery.service";

const toLink = (
	relation: IssueRelationDto,
	other: IssueDto,
): IssueRelationLinkDto => ({
	id: relation.id,
	type: relation.type as IssueRelationType,
	issue: {
		id: other.id,
		orgId: other.orgId,
		projectId: other.projectId,
		number: other.number,
		title: other.title,
		statusId: other.statusId,
		status: other.status,
		priority: other.priority,
		parentId: other.parentId,
	},
	createdAt: relation.createdAt,
	createdById: relation.createdById,
});

export const emptyRelations = (): IssueRelationsDto => ({
	blocks: [],
	blockedBy: [],
	related: [],
	duplicates: [],
});

export const createRelationService = ({
	relationDao,
	issueDao,
	projectDao,
	webhooks,
}: {
	relationDao: RelationDao;
	issueDao: IssueDao;
	projectDao: ProjectDao;
	webhooks?: WebhookDispatcher;
}) => {
	const requireIssue = async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<IssueDto> => {
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
		return issue;
	};

	const assertProjectWritable = async (orgId: string, projectId: string) => {
		const project = await projectDao.findById(orgId, projectId);
		if (!project || project.archived) {
			throw new ApiError(
				409,
				ApiErrorCode.PROJECT_ARCHIVED,
				"Project is archived and read-only",
			);
		}
		return project;
	};

	/** Issue payload dispatched with `issue.updated` after relation writes. */
	const issuePayload = async (issue: IssueDto) => ({
		...issue,
		labelIds: await issueDao.findLabelIds(issue.id),
	});

	return {
		listRelations: async (
			orgId: string,
			projectId: string,
			number: number,
		): Promise<IssueRelationsDto> => {
			const issue = await requireIssue(orgId, projectId, number);
			const relations = await relationDao.listByIssue(orgId, issue.id);
			if (relations.length === 0) {
				return emptyRelations();
			}
			const otherIds = relations.map((relation) =>
				relation.issueId === issue.id
					? relation.relatedIssueId
					: relation.issueId,
			);
			const others = await issueDao.findByIds(orgId, [...new Set(otherIds)]);
			const otherById = new Map(others.map((other) => [other.id, other]));
			const grouped = emptyRelations();
			for (const relation of relations) {
				const otherId =
					relation.issueId === issue.id
						? relation.relatedIssueId
						: relation.issueId;
				const other = otherById.get(otherId);
				// Soft-deleted or missing issues disappear from the grouped view.
				if (!other) {
					continue;
				}
				const link = toLink(relation, other);
				if (relation.type === "blocks") {
					if (relation.issueId === issue.id) {
						grouped.blocks.push(link);
					} else {
						grouped.blockedBy.push(link);
					}
				} else if (relation.type === "related") {
					grouped.related.push(link);
				} else if (relation.type === "duplicates") {
					grouped.duplicates.push(link);
				}
			}
			return grouped;
		},

		createRelation: async (
			orgId: string,
			projectId: string,
			number: number,
			userId: string | null,
			input: CreateIssueRelationInput,
			background?: BackgroundFn,
		): Promise<IssueRelationDto> => {
			const issue = await requireIssue(orgId, projectId, number);
			const project = await assertProjectWritable(orgId, issue.projectId);
			const other = await issueDao.findById(orgId, input.relatedIssueId);
			if (!other) {
				throw new ApiError(
					404,
					ApiErrorCode.ISSUE_NOT_FOUND,
					"Related issue does not exist in this organization",
				);
			}
			if (other.id === issue.id) {
				throw new ApiError(
					400,
					ApiErrorCode.ISSUE_RELATION_INVALID,
					"An issue cannot be related to itself",
				);
			}
			if (other.projectId !== issue.projectId) {
				throw new ApiError(
					400,
					ApiErrorCode.ISSUE_RELATION_INVALID,
					"Related issues must belong to the same project",
				);
			}

			// Normalize to the canonical storage direction.
			let stored: {
				issueId: string;
				relatedIssueId: string;
				type: IssueRelationType;
			};
			switch (input.type) {
				case "blocked_by":
					stored = {
						issueId: other.id,
						relatedIssueId: issue.id,
						type: "blocks",
					};
					break;
				case "blocks":
					stored = {
						issueId: issue.id,
						relatedIssueId: other.id,
						type: "blocks",
					};
					break;
				default: {
					// Symmetric relations (related, duplicates): sort ids so the
					// reverse link is the same row from either side.
					const [first, second] = [issue.id, other.id].sort();
					stored = {
						issueId: first,
						relatedIssueId: second,
						type: input.type,
					};
				}
			}

			const existing = await relationDao.findByPair(
				orgId,
				stored.issueId,
				stored.relatedIssueId,
				stored.type,
			);
			if (existing) {
				throw new ApiError(
					409,
					ApiErrorCode.ISSUE_RELATION_EXISTS,
					"These issues are already linked with this relation type",
				);
			}
			if (stored.type === "blocks") {
				// The new edge only closes a cycle when the target can already
				// reach the current issue through blocks edges. Checked with one
				// recursive traversal, so A→B→C also rejects C→A.
				const closesCycle = await relationDao.hasBlocksPath(
					orgId,
					stored.relatedIssueId,
					stored.issueId,
				);
				if (closesCycle) {
					throw new ApiError(
						409,
						ApiErrorCode.ISSUE_RELATION_CYCLE,
						"Blocking relations cannot form a cycle",
					);
				}
			}

			const activity: ActivityInsert | undefined = userId
				? {
						id: crypto.randomUUID(),
						orgId,
						projectId: issue.projectId,
						issueId: issue.id,
						actorId: userId,
						action: "issue.updated",
						field: `relation:${input.type}`,
						oldValue: null,
						newValue: issueKey(project.key, other.number),
					}
				: undefined;

			const relation = await relationDao.create(
				{
					id: crypto.randomUUID(),
					orgId,
					issueId: stored.issueId,
					relatedIssueId: stored.relatedIssueId,
					type: stored.type,
					createdById: userId,
				},
				activity,
			);
			await webhooks?.dispatch(
				orgId,
				"issue.updated",
				await issuePayload(issue),
				background,
			);
			return relation;
		},

		deleteRelation: async (
			orgId: string,
			projectId: string,
			number: number,
			userId: string | null,
			relationId: string,
			background?: BackgroundFn,
		): Promise<void> => {
			const issue = await requireIssue(orgId, projectId, number);
			const project = await assertProjectWritable(orgId, issue.projectId);
			const relation = await relationDao.findById(orgId, relationId);
			if (
				!relation ||
				(relation.issueId !== issue.id && relation.relatedIssueId !== issue.id)
			) {
				throw new ApiError(
					404,
					ApiErrorCode.ISSUE_RELATION_INVALID,
					`Relation ${relationId} not found for this issue`,
				);
			}
			const otherId =
				relation.issueId === issue.id
					? relation.relatedIssueId
					: relation.issueId;
			const other = await issueDao.findById(orgId, otherId);
			const perspectiveType =
				relation.type === "blocks" && relation.issueId !== issue.id
					? "blocked_by"
					: relation.type;
			const activity: ActivityInsert | undefined = userId
				? {
						id: crypto.randomUUID(),
						orgId,
						projectId: issue.projectId,
						issueId: issue.id,
						actorId: userId,
						action: "issue.updated",
						field: `relation:${perspectiveType}`,
						oldValue: other ? issueKey(project.key, other.number) : null,
						newValue: null,
					}
				: undefined;
			const deleted = await relationDao.delete(orgId, relationId, activity);
			if (!deleted) {
				throw new ApiError(
					404,
					ApiErrorCode.ISSUE_RELATION_INVALID,
					`Relation ${relationId} not found`,
				);
			}
			await webhooks?.dispatch(
				orgId,
				"issue.updated",
				await issuePayload(issue),
				background,
			);
		},
	};
};

export type RelationService = ReturnType<typeof createRelationService>;
