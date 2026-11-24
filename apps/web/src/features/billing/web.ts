import { CreditCardIcon } from "lucide-react";
import { AdminOrgQuotaAction } from "@/features/billing/components/admin-org-quota-action";
import { LandingPricing } from "@/features/billing/components/landing-pricing";
import { QuotaUpgradeLink } from "@/features/billing/components/quota-upgrade-link";
import type { WebFeatureDecl } from "@/features/web-types";

/** Billing: settings page (read-open to members) + palette shortcut. */
export const billingWeb: WebFeatureDecl = {
	id: "billing",
	i18nNamespaces: ["billing", "quota"],
	settingsNav: () => [
		{
			id: "billing",
			to: "/orgs/$orgId/settings/billing",
			labelKey: "settings.billing",
		},
	],
	paletteActions: () => [
		{
			id: "settings-billing",
			labelKey: "command.settingsBilling",
			icon: CreditCardIcon,
			when: (ctx) => ctx.canManage,
			run: (ctx) =>
				ctx.navigate({
					to: "/orgs/$orgId/settings/billing",
					params: { orgId: ctx.orgId },
				}),
		},
	],
	quotaUpgrade: QuotaUpgradeLink,
	landingPricing: LandingPricing,
	adminOrgActions: [{ id: "quota", order: 10, component: AdminOrgQuotaAction }],
};
