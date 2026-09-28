import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { isPlanLimitError } from "@/lib/api";

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
			<p className="text-destructive text-sm">{error.message}</p>
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
