import {
	type ActivityListQuery,
	ApiError,
	ApiErrorCode,
} from "@workspace/shared";
import type { ActivityDao } from "../../../core/dao/activity.dao";
import type {
	ActivityDto,
	OrgActivityDto,
} from "../../../core/dto/activity.dto";
import type { IssueDao } from "../../issues/dao/issue.dao";

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
