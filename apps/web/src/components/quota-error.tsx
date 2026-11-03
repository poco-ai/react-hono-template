import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isPlanLimitError } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";

export function QuotaError({
	error,
	orgId,
	canUpgrade,
}: {
	error: Error | null;
	orgId: string;
	canUpgrade: boolean;
}) {
	const { t } = useTranslation();
	if (!error) {
		return null;
	}
	return (
		<div className="flex flex-col gap-1">
			<Alert variant="destructive">
				<CircleAlert />
				<AlertDescription>{apiErrorMessage(t, error)}</AlertDescription>
			</Alert>
			{canUpgrade && isPlanLimitError(error) && (
				<Button
					variant="link"
					size="sm"
					className="w-fit px-0"
					render={
						<Link to="/orgs/$orgId/settings/billing" params={{ orgId }} />
					}
				>
					{t("quota.upgrade")}
				</Button>
			)}
		</div>
	);
}
