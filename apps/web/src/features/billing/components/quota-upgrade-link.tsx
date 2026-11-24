import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { useTranslation } from "react-i18next";

/** Upgrade link rendered by the core `QuotaError` component (billing only). */
export function QuotaUpgradeLink({ orgId }: { orgId: string; error: Error }) {
	const { t } = useTranslation();
	return (
		<Button
			variant="link"
			size="sm"
			className="w-fit px-0"
			render={<Link to="/orgs/$orgId/settings/billing" params={{ orgId }} />}
		>
			{t("quota.upgrade")}
		</Button>
	);
}
