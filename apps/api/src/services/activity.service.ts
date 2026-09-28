import {
	type ActivityListQuery,
	ApiError,
	ApiErrorCode,
} from "@workspace/shared";
import type { ActivityDao } from "../dao/activity.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { ActivityDto, OrgActivityDto } from "../dto/activity.dto";

export const createActivityService = ({
	activityDao,
	issueDao,
}: {
	activityDao: ActivityDao;
	issueDao: IssueDao;
}) => ({
	listByIssue: async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<ActivityDto[]> => {
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
		return activityDao.listByIssue(orgId, issue.id);
	},

	listByOrg: (
		orgId: string,
		query: ActivityListQuery,
	): Promise<OrgActivityDto[]> => activityDao.listByOrg(orgId, query),
});

export type ActivityService = ReturnType<typeof createActivityService>;
