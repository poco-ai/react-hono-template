import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PLANS, type PlanLimits } from "@workspace/shared";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
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
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	billingQuery,
	useCreateBillingPortal,
	useCreateCheckout,
} from "@/features/billing/data";

import { apiErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/issue-utils";

import { useDocumentTitle } from "@/lib/use-document-title";

const MB = 1024 * 1024;

function UsageBar({ usage, cap }: { usage: number; cap: number }) {
	if (cap === 0) {
		return <div className="bg-muted/50 h-1.5 w-full rounded-full" />;
	}
	const pct = Math.min(100, (usage / cap) * 100);
	return (
		<div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
			<div
				className={`h-full rounded-full ${
					pct >= 100
						? "bg-destructive"
						: pct >= 80
							? "bg-amber-500 dark:bg-amber-400"
							: "bg-primary"
				}`}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

function UsageRow({
	label,
	usage,
	cap,
	unavailableNote,
	onUnlock,
}: {
	label: string;
	usage: number;
	cap: number;
	unavailableNote?: string;
	onUnlock?: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between text-sm">
				<span>{label}</span>
				<span className="text-muted-foreground">
					{cap === 0 ? "—" : t("billing.usageOf", { current: usage, cap })}
				</span>
			</div>
			<UsageBar usage={usage} cap={cap} />
			{cap === 0 && unavailableNote && (
				<p className="text-muted-foreground text-xs">
					{unavailableNote}
					{onUnlock && (
						<>
							{" "}
							<button
								type="button"
								onClick={onUnlock}
								className="text-foreground font-medium underline-offset-2 hover:underline"
							>
								{t("billing.upgradeToUnlock")}
							</button>
						</>
					)}
				</p>
			)}
		</div>
	);
}

function PlanValue({ children }: { children: string }) {
	return <span className="text-sm font-medium">{children}</span>;
}

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

			<AlertDialog
				open={upgradeOpen}
				onOpenChange={(open) => !open && setUpgradeOpen(false)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("billing.mockUpgradeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("billing.mockUpgradeDescription", {
								price: `$${PLANS.pro.price}`,
							})}
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
