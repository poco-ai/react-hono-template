import { useTranslation } from "react-i18next";
import { OrganizationInvitations } from "@/components/auth/organization/organization-invitations";
import { OrganizationMembers } from "@/components/auth/organization/organization-members";
import { useActiveOrganizationReady } from "@/features/organizations/active-organization";
import { OrgWriteLockProvider } from "@/features/organizations/org-write-lock";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useDocumentTitle } from "@/lib/use-document-title";

export function MembersSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.members"));
	const { ready, failed } = useActiveOrganizationReady(orgId);
	const frozen = useOrgFrozen(orgId);

	if (failed) {
		return (
			<p className="text-muted-foreground text-sm">
				{t("common.failedToLoad")}
			</p>
		);
	}
	if (!ready) {
		return (
			<p className="text-muted-foreground text-sm">{t("common.loading")}</p>
		);
	}

	return (
		<OrgWriteLockProvider locked={frozen}>
			<div className="flex flex-col gap-10">
				<OrganizationMembers />
				<OrganizationInvitations />
			</div>
		</OrgWriteLockProvider>
	);
}
