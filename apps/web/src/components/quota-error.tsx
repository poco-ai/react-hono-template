import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
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
				<Link
					to="/orgs/$orgId/settings/billing"
					params={{ orgId }}
					className="text-primary text-sm font-medium underline underline-offset-4"
				>
					{t("quota.upgrade")}
				</Link>
			)}
		</div>
	);
}
