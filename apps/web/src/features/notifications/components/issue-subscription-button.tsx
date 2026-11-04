import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	issueSubscriptionQuery,
	useUpdateIssueSubscription,
} from "@/features/notifications/data";
import { apiErrorMessage } from "@/lib/errors";

/**
 * Follow/unfollow toggle for one issue. Shows whether the current user is
 * subscribed and flips that state through the notifications data layer (which
 * also invalidates the subscription cache).
 */
export function IssueSubscriptionButton({
	orgId,
	projectId,
	issueNumber,
	disabled,
}: {
	orgId: string;
	projectId: string;
	issueNumber: number;
	/** Frozen organizations keep reads but block subscription writes. */
	disabled?: boolean;
}) {
	const { t } = useTranslation();
	const subscription = useQuery(
		issueSubscriptionQuery(orgId, projectId, issueNumber),
	);
	const mutation = useUpdateIssueSubscription(orgId, projectId, issueNumber, {
		onSuccess: (result) => {
			toast.success(
				result.subscribed
					? t("notifications.subscription.subscribedToast")
					: t("notifications.subscription.unsubscribedToast"),
			);
		},
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});

	const subscribed = subscription.data?.subscribed ?? false;
	const label = subscribed
		? t("notifications.subscription.unsubscribe")
		: t("notifications.subscription.subscribe");
	const hint = disabled ? t("org.frozenBanner") : label;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						className="size-7"
						aria-label={label}
						aria-pressed={subscribed}
						title={hint}
						disabled={disabled || mutation.isPending || subscription.isPending}
						onClick={() => mutation.mutate({ subscribed: !subscribed })}
					>
						{subscribed ? <Bell /> : <BellOff />}
					</Button>
				}
			/>
			<TooltipContent>{hint}</TooltipContent>
		</Tooltip>
	);
}
