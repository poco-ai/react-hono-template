import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrganizationDangerZone } from "@/components/auth/organization/organization-danger-zone";
import { OrganizationProfile } from "@/components/auth/organization/organization-profile";
import { useActiveOrganizationReady } from "@/features/organizations/active-organization";
import { OrgWriteLockProvider } from "@/features/organizations/org-write-lock";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { useDocumentTitle } from "@/lib/use-document-title";

export function GeneralSettingsPage({
	orgId,
	denied,
}: {
	orgId: string;
	denied?: boolean;
}) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.general"));
	const { ready, failed } = useActiveOrganizationReady(orgId);
	const frozen = useOrgFrozen(orgId);
	const { canManage } = useOrgRole(orgId);

	return (
		<div className="flex flex-col gap-8">
			{denied && (
				<Alert>
					<CircleAlert />
					<AlertDescription>{t("settings.noPermission")}</AlertDescription>
				</Alert>
			)}
			{failed ? (
				<p className="text-muted-foreground text-sm">
					{t("common.failedToLoad")}
				</p>
			) : !ready ? (
				<p className="text-muted-foreground text-sm">{t("common.loading")}</p>
			) : (
				<OrgWriteLockProvider locked={frozen}>
					<OrganizationProfile />
					{!canManage && (
						<p className="text-muted-foreground text-xs">
							{t("errors.orgSettingsRequired")}
						</p>
					)}
					<OrganizationDangerZone />
				</OrgWriteLockProvider>
			)}
		</div>
	);
}
