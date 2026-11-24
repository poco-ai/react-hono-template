import type { IssueSubscriptionReason } from "@workspace/shared";

export type IssueSubscriptionDto = {
	subscribed: boolean;
	muted: boolean;
	reason: IssueSubscriptionReason | null;
};
