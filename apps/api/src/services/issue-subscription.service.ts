import {
	ApiError,
	ApiErrorCode,
	ISSUE_SUBSCRIPTION_REASONS,
	type IssueSubscriptionReason,
	type UpdateIssueSubscriptionInput,
} from "@workspace/shared";
import type { IssueDao } from "../dao/issue.dao";
import type { IssueSubscriptionDao } from "../dao/issue-subscription.dao";
import type { IssueSubscriptionDto } from "../dto/issue-subscription.dto";

const toReason = (value: string | null): IssueSubscriptionReason | null =>
	value && (ISSUE_SUBSCRIPTION_REASONS as readonly string[]).includes(value)
		? (value as IssueSubscriptionReason)
		: null;

/**
 * Manual follow/unfollow for an issue. Automatic reasons (creator, assignee,
 * commenter, mention) are written by the notification fan-out; the toggle only
 * creates `manual` rows or flips `muted`, and unfollow removes the row so the
 * next automatic event can subscribe again.
 */
export const createIssueSubscriptionService = ({
	issueDao,
	subscriptionDao,
}: {
	issueDao: Pick<IssueDao, "findByProjectAndNumber">;
	subscriptionDao: IssueSubscriptionDao;
}) => {
	const requireIssueId = async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<string> => {
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
		return issue.id;
	};

	return {
		getSubscription: async (
			orgId: string,
			projectId: string,
			number: number,
			userId: string,
		): Promise<IssueSubscriptionDto> => {
			const issueId = await requireIssueId(orgId, projectId, number);
			const row = await subscriptionDao.findByIssueAndUser(issueId, userId);
			return {
				subscribed: Boolean(row),
				muted: row?.muted ?? false,
				reason: toReason(row?.reason ?? null),
			};
		},

		updateSubscription: async (
			orgId: string,
			projectId: string,
			number: number,
			userId: string,
			input: UpdateIssueSubscriptionInput,
		): Promise<IssueSubscriptionDto> => {
			const issueId = await requireIssueId(orgId, projectId, number);
			if (!input.subscribed) {
				await subscriptionDao.delete(issueId, userId);
				return { subscribed: false, muted: false, reason: null };
			}
			const existing = await subscriptionDao.findByIssueAndUser(
				issueId,
				userId,
			);
			const muted = input.muted ?? existing?.muted ?? false;
			await subscriptionDao.setManual(orgId, issueId, userId, muted);
			return {
				subscribed: true,
				muted,
				reason: toReason(existing?.reason ?? "manual") ?? "manual",
			};
		},
	};
};

export type IssueSubscriptionService = ReturnType<
	typeof createIssueSubscriptionService
>;
