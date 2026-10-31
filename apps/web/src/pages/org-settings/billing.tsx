import { useSearch } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BillingSettings } from "@/components/auth/billing/billing-settings";
import { DowngradeDialog } from "@/features/billing/components/downgrade-dialog";
import { UpgradeDialog } from "@/features/billing/components/upgrade-dialog";
import {
	type BillingConfirmation,
	useAppBillingAdapter,
} from "@/features/billing/data";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { useDocumentTitle } from "@/lib/use-document-title";

export function BillingSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.billing"));
	const { checkout } = useSearch({
		from: "/_auth/orgs/$orgId/settings/billing",
	});
	const { canManage } = useOrgRole(orgId);
	const [bannerDismissed, setBannerDismissed] = useState(false);
	const [confirmation, setConfirmation] = useState<"upgrade" | "downgrade">();
	const resolveConfirmation = useRef<((accepted: boolean) => void) | undefined>(
		undefined,
	);
	const confirm = useCallback<BillingConfirmation>(
		(action) =>
			new Promise((resolve) => {
				resolveConfirmation.current?.(false);
				resolveConfirmation.current = resolve;
				setConfirmation(action);
			}),
		[],
	);
	const finishConfirmation = (accepted: boolean) => {
		resolveConfirmation.current?.(accepted);
		resolveConfirmation.current = undefined;
		setConfirmation(undefined);
	};
	useEffect(() => {
		if (!orgId) return;
		setConfirmation(undefined);
		return () => {
			resolveConfirmation.current?.(false);
			resolveConfirmation.current = undefined;
		};
	}, [orgId]);
	useEffect(() => {
		if (checkout === "success") toast.success(t("toast.billingUpgraded"));
	}, [checkout, t]);
	const adapter = useAppBillingAdapter(orgId, canManage, confirm);
	return (
		<div className="flex flex-col gap-6">
			{checkout === "canceled" && !bannerDismissed && (
				<div className="flex items-center justify-between rounded-md border px-4 py-3 text-sm text-muted-foreground">
					<span>{t("billing.checkoutCanceled")}</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setBannerDismissed(true)}
					>
						{t("billing.dismiss")}
					</Button>
				</div>
			)}
			<BillingSettings
				key={orgId}
				adapter={adapter}
				scope={{
					type: "organization",
					organizationId: orgId,
					organizationSlug: orgId,
				}}
				readOnly={!canManage}
			/>
			<UpgradeDialog
				open={confirmation === "upgrade"}
				onOpenChange={(open) => {
					if (!open) finishConfirmation(false);
				}}
				pending={false}
				onConfirm={() => finishConfirmation(true)}
			/>
			<DowngradeDialog
				open={confirmation === "downgrade"}
				onOpenChange={(open) => {
					if (!open) finishConfirmation(false);
				}}
				pending={false}
				onConfirm={() => finishConfirmation(true)}
			/>
		</div>
	);
}
