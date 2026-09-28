import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PLANS, type PlanLimits } from "@workspace/shared";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { client, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/issue-utils";
import { billingQuery, billingRootKey } from "@/lib/queries/billing";

const MB = 1024 * 1024;

function UsageBar({ usage, cap }: { usage: number; cap: number }) {
	const pct = cap > 0 ? Math.min(100, (usage / cap) * 100) : 0;
	return (
		<div className="bg-muted h-2 w-full overflow-hidden rounded-full">
			<div
				className={pct >= 100 ? "bg-destructive h-full" : "bg-primary h-full"}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

function UsageRow({
	label,
	usage,
	cap,
}: {
	label: string;
	usage: number;
	cap: number;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between text-sm">
				<span>{label}</span>
				<span className="text-muted-foreground">
					{cap === 0
						? t("billing.notAvailable")
						: t("billing.usageOf", { current: usage, cap })}
				</span>
			</div>
			<UsageBar usage={usage} cap={cap} />
		</div>
	);
}

function PlanValue({ children }: { children: string }) {
	return <span className="text-sm font-medium">{children}</span>;
}

export function BillingSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { checkout } = useSearch({
		from: "/_auth/orgs/$orgId/settings/billing",
	});
	const [bannerDismissed, setBannerDismissed] = useState(false);
	const [notice, setNotice] = useState<"upgraded" | "downgraded" | null>(null);
	const [upgradeOpen, setUpgradeOpen] = useState(false);
	const [portalOpen, setPortalOpen] = useState(false);

	const billing = useQuery(billingQuery(orgId));

	const checkoutMutation = useMutation({
		mutationFn: () =>
			unwrap(
				client.api.orgs[":orgId"].billing.checkout.$post({ param: { orgId } }),
			),
		onSuccess: (res) => {
			if (res.url) {
				window.location.href = res.url;
				return;
			}
			setUpgradeOpen(false);
			setNotice("upgraded");
			queryClient.invalidateQueries({ queryKey: billingRootKey(orgId) });
		},
	});

	const portalMutation = useMutation({
		mutationFn: () =>
			unwrap(
				client.api.orgs[":orgId"].billing.portal.$post({ param: { orgId } }),
			),
		onSuccess: (res) => {
			if (res.url) {
				window.location.href = res.url;
				return;
			}
			setPortalOpen(false);
			setNotice("downgraded");
			queryClient.invalidateQueries({ queryKey: billingRootKey(orgId) });
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
				{billing.error.message}
			</p>
		);
	}

	const data = billing.data;
	const isPro = data.plan === "pro";
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
			{checkout === "success" && !bannerDismissed && (
				<div className="flex items-center justify-between rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
					<span>{t("billing.checkoutSuccess")}</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setBannerDismissed(true)}
					>
						{t("billing.dismiss")}
					</Button>
				</div>
			)}
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
			{notice === "upgraded" && (
				<div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
					{t("billing.upgradedNotice")}
				</div>
			)}
			{notice === "downgraded" && (
				<div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
					{t("billing.downgradedNotice")}
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
						/>
					</div>
					<div className="flex items-center gap-2">
						{isPro ? (
							<Button
								disabled={portalMutation.isPending}
								onClick={() => {
									setNotice(null);
									if (data.stripeEnabled || !data.mockMode) {
										portalMutation.mutate();
									} else {
										setPortalOpen(true);
									}
								}}
							>
								{t("billing.manageBilling")}
							</Button>
						) : (
							<Button
								disabled={checkoutMutation.isPending}
								onClick={() => {
									setNotice(null);
									if (data.stripeEnabled || !data.mockMode) {
										checkoutMutation.mutate();
									} else {
										setUpgradeOpen(true);
									}
								}}
							>
								{t("billing.upgrade")}
							</Button>
						)}
					</div>
					{(checkoutMutation.isError || portalMutation.isError) && (
						<p className="text-destructive text-sm">
							{(checkoutMutation.error ?? portalMutation.error)?.message}
						</p>
					)}
				</CardContent>
			</Card>

			{!isPro && (
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
									<TableHead>{t("billing.planFree")}</TableHead>
									<TableHead>{t("billing.planPro")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.key}>
										<TableCell>{t(row.key)}</TableCell>
										<TableCell>
											<PlanValue>{row.render(PLANS.free)}</PlanValue>
										</TableCell>
										<TableCell>
											<PlanValue>{row.render(PLANS.pro)}</PlanValue>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			<AlertDialog
				open={upgradeOpen}
				onOpenChange={(open) => !open && setUpgradeOpen(false)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("billing.mockUpgradeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("billing.mockUpgradeDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							disabled={checkoutMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								checkoutMutation.mutate();
							}}
						>
							{t("billing.upgrade")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={portalOpen}
				onOpenChange={(open) => !open && setPortalOpen(false)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("billing.mockDowngradeTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("billing.mockDowngradeDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={portalMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								portalMutation.mutate();
							}}
						>
							{t("billing.downgrade")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
