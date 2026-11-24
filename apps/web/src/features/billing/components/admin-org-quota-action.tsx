import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OrgQuotaDialog } from "@/features/billing/components/admin-org-quota-dialog";
import type { AdminOrgContext } from "@/features/web-types";

/** Per-row admin quota action: opens the quota/credit editor for one org. */
export function AdminOrgQuotaAction({ org }: AdminOrgContext) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				{t("adminOrgs.quota")}
			</Button>
			<OrgQuotaDialog
				orgId={org.id}
				orgName={org.name}
				open={open}
				onOpenChange={setOpen}
			/>
		</>
	);
}
