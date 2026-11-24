import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { webQuotaUpgrade } from "@/features/registry";
import { isPlanLimitError } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";

/**
 * Shared plan-limit error surface. The upgrade link is a registry
 * contribution (billing), so presets without billing still render the error.
 */
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
	const QuotaUpgrade = webQuotaUpgrade();
	return (
		<div className="flex flex-col gap-1">
			<Alert variant="destructive">
				<CircleAlert />
				<AlertDescription>{apiErrorMessage(t, error)}</AlertDescription>
			</Alert>
			{canUpgrade && isPlanLimitError(error) && QuotaUpgrade ? (
				<QuotaUpgrade orgId={orgId} error={error} />
			) : null}
		</div>
	);
}
