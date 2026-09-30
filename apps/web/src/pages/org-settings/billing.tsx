import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PLANS, type PlanLimits } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DowngradeDialog } from "@/features/billing/components/downgrade-dialog";
import { PlanValue } from "@/features/billing/components/plan-value";
import { UpgradeDialog } from "@/features/billing/components/upgrade-dialog";
import { UsageRow } from "@/features/billing/components/usage-row";
import {
	billingQuery,
	useCreateBillingPortal,
	useCreateCheckout,
} from "@/features/billing/data";

import { apiErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";

import { useDocumentTitle } from "@/lib/use-document-title";

const MB = 1024 * 1024;

export function BillingSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.billing"));

	const { checkout } = useSearch({
		from: "/_auth/orgs/$orgId/settings/billing",
	});
	const [bannerDismissed, setBannerDismissed] = useState(false);
	const [upgradeOpen, setUpgradeOpen] = useState(false);
	const [portalOpen, setPortalOpen] = useState(false);

	const billing = useQuery(billingQuery(orgId));

	useEffect(() => {
		if (checkout === "success") {
			toast.success(t("toast.billingUpgraded"));
		}
	}, [checkout, t]);

	const checkoutMutation = useCreateCheckout(orgId, {
		onSuccess: (res) => {
			if (res.url) {
				window.location.href = res.url;
				return;
			}
			setUpgradeOpen(false);
			toast.success(t("toast.billingUpgraded"));
		},
	});

	const portalMutation = useCreateBillingPortal(orgId, {
		onSuccess: (res) => {
			if (res.url) {
				window.location.href = res.url;
				return;
			}
			setPortalOpen(false);
			toast.success(t("toast.billingDowngraded"));
		},
	});

	if (billing.isPending) {
		return (
			<p className="text-muted-foreground py-16 text-center text-sm">
				{t("common.loading")}
			</p>
		);
	}

	if (billing.isError) {
		return (
			<p className="py-16 text-center text-sm text-red-500">
				{apiErrorMessage(t, billing.error)}
			</p>
		);
	}

	const data = billing.data;
	const isPro = data.plan === "pro";
	const startUpgrade = () => {
		if (data.stripeEnabled || !data.mockMode) {
			checkoutMutation.mutate();
		} else {
			setUpgradeOpen(true);
		}
	};
	const rows: {
		key:
			| "billing.limits.members"
			| "billing.limits.projects"
			| "billing.attachmentSize"
			| "billing.apiRateLimit"
			| "billing.limits.webhooks";
		render: (limits: PlanLimits) => string;
	}[] = [
		{
			key: "billing.limits.members",
			render: (limits) => String(limits.members),
		},
		{
			key: "billing.limits.projects",
			render: (limits) => String(limits.projects),
		},
		{
			key: "billing.attachmentSize",
			render: (limits) =>
				t("billing.megabytes", { value: limits.attachmentMaxSize / MB }),
		},
		{
			key: "billing.apiRateLimit",
			render: (limits) =>
				t("billing.perMinute", { value: limits.apiRateLimit }),
		},
		{
			key: "billing.limits.webhooks",
			render: (limits) => String(limits.webhooks),
		},
	];

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

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						{t("billing.currentPlan")}
						<Badge
							variant={isPro ? "default" : "outline"}
							className={
								isPro
									? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
									: undefined
							}
						>
							{isPro ? t("billing.planPro") : t("billing.planFree")}
						</Badge>
					</CardTitle>
					{data.currentPeriodEnd && (
						<CardDescription>
							{t("billing.renewsOn", {
								date: formatDate(data.currentPeriodEnd),
							})}
						</CardDescription>
					)}
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<div className="flex flex-col gap-4">
						<UsageRow
							label={t("billing.limits.members")}
							usage={data.usage.members}
							cap={data.limits.members}
						/>
						<UsageRow
							label={t("billing.limits.projects")}
							usage={data.usage.projects}
							cap={data.limits.projects}
						/>
						<UsageRow
							label={t("billing.limits.webhooks")}
							usage={data.usage.webhooks}
							cap={data.limits.webhooks}
							unavailableNote={
								isPro ? undefined : t("billing.webhooksNotInPlan")
							}
							onUnlock={isPro ? undefined : startUpgrade}
						/>
					</div>
					<div className="flex items-center gap-2">
						{isPro ? (
							data.stripeEnabled || !data.mockMode ? (
								<Button
									disabled={portalMutation.isPending}
									onClick={() => portalMutation.mutate()}
								>
									{t("billing.manageBilling")}
								</Button>
							) : (
								<Button
									variant="destructive"
									disabled={portalMutation.isPending}
									onClick={() => setPortalOpen(true)}
								>
									{t("billing.downgrade")}
								</Button>
							)
						) : (
							<Button
								disabled={checkoutMutation.isPending}
								onClick={startUpgrade}
							>
								{t("billing.upgrade")}
							</Button>
						)}
					</div>
					{(checkoutMutation.isError || portalMutation.isError) && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{(checkoutMutation.error ?? portalMutation.error)?.message}
							</AlertDescription>
						</Alert>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("billing.compareTitle")}</CardTitle>
					<CardDescription>{t("billing.compareDescription")}</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("billing.feature")}</TableHead>
								<TableHead>
									<span className="flex items-center gap-1.5">
										{t("billing.planFree")}
										{!isPro && (
											<Badge variant="outline">
												{t("billing.currentPlan")}
											</Badge>
										)}
									</span>
								</TableHead>
								<TableHead className="bg-muted/40">
									<span className="flex items-center gap-1.5">
										{t("billing.planPro")}
										{!isPro && (
											<Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
												{t("billing.recommended")}
											</Badge>
										)}
										{isPro && (
											<Badge
												variant="default"
												className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
											>
												{t("billing.currentPlan")}
											</Badge>
										)}
									</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow>
								<TableCell>{t("billing.price")}</TableCell>
								<TableCell>
									<PlanValue>{`$${PLANS.free.price}`}</PlanValue>
								</TableCell>
								<TableCell className="bg-muted/40">
									<PlanValue>
										{t("billing.pricePerMember", {
											price: `$${PLANS.pro.price}`,
										})}
									</PlanValue>
								</TableCell>
							</TableRow>
							{rows.map((row) => (
								<TableRow key={row.key}>
									<TableCell>{t(row.key)}</TableCell>
									<TableCell>
										<PlanValue>{row.render(PLANS.free)}</PlanValue>
									</TableCell>
									<TableCell className="bg-muted/40">
										<PlanValue>{row.render(PLANS.pro)}</PlanValue>
									</TableCell>
								</TableRow>
							))}
							<TableRow>
								<TableCell />
								<TableCell />
								<TableCell className="bg-muted/40">
									{isPro ? (
										<span className="text-muted-foreground text-sm">
											{t("billing.currentPlan")}
										</span>
									) : (
										<Button
											size="sm"
											disabled={checkoutMutation.isPending}
											onClick={startUpgrade}
										>
											{t("billing.upgrade")}
										</Button>
									)}
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<UpgradeDialog
				open={upgradeOpen}
				onOpenChange={(open) => !open && setUpgradeOpen(false)}
				pending={checkoutMutation.isPending}
				onConfirm={() => checkoutMutation.mutate()}
			/>

			<DowngradeDialog
				open={portalOpen}
				onOpenChange={(open) => !open && setPortalOpen(false)}
				pending={portalMutation.isPending}
				onConfirm={() => portalMutation.mutate()}
			/>
		</div>
	);
}
