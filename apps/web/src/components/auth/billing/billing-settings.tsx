"use client";

import {
	type BillingAdapter,
	type BillingInterval,
	type BillingPlan,
	type BillingScope,
	followBillingAction,
} from "@better-auth-ui/core/plugins/billing";
import {
	useBillingCheckout,
	useBillingPlans,
	useBillingPortal,
	useBillingState,
} from "@better-auth-ui/react/plugins/billing";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Progress } from "@workspace/ui/components/progress";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "cn";
import { Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiErrorMessage } from "@/lib/errors";

// Installed from Better Auth UI 1.7.32 base-nova billing registry.
// App adapter owns billing actions; unsupported seat/subscription actions are omitted.
function useBillingLocalization() {
	const { t } = useTranslation();
	return {
		billing: t("settings.billing"),
		billingDescription: t("billing.compareDescription"),
		currentPlan: t("billing.currentPlan"),
		choosePlan: t("billing.choosePlan"),
		perMonth: t("billing.pricePerMember", { price: "" }).trim(),
		perYear: "",
		oneTime: "",
		popular: t("billing.recommended"),
		subscription: t("billing.currentPlan"),
		noSubscriptionDescription: t("billing.compareDescription"),
		noSubscription: t("billing.planFree"),
		renewsOn: t("billing.renewsOn", { date: "{{date}}" }),
		manageBilling: t("billing.manageBilling"),
		usage: t("billing.usage"),
		used: t("billing.used", { used: "{{used}}" }),
		plans: t("billing.compareTitle"),
		loadingBilling: t("common.loading"),
	};
}

export type BillingSettingsProps = {
	adapter: BillingAdapter;
	scope: BillingScope;
	className?: string;
	readOnly?: boolean;
};

const formatPrice = (amount: number, currency: string) => {
	const fractionDigits =
		new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
		}).resolvedOptions().maximumFractionDigits ?? 2;
	const divisor = 10 ** fractionDigits;

	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency,
		maximumFractionDigits: amount % divisor === 0 ? 0 : fractionDigits,
	}).format(amount / divisor);
};

const availableIntervals = (plans: BillingPlan[]) =>
	Array.from(
		new Set(
			plans.flatMap((plan) => plan.prices.map((price) => price.interval)),
		),
	);

function PlanCard({
	plan,
	interval,
	currentPlanId,
	isPending,
	onChoose,
}: {
	plan: BillingPlan;
	interval: BillingInterval;
	currentPlanId?: string;
	isPending: boolean;
	onChoose: (plan: BillingPlan, priceId: string) => void;
}) {
	const localization = useBillingLocalization();
	const price = plan.prices.find((entry) => entry.interval === interval);
	if (!price) return null;
	const isCurrent = currentPlanId === plan.id;
	const suffix =
		price.interval === "month"
			? localization.perMonth
			: price.interval === "year"
				? localization.perYear
				: localization.oneTime;

	return (
		<Card
			className={cn(
				"relative h-full",
				plan.highlighted && "border-primary/50 bg-primary/5",
			)}
		>
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 flex-col gap-1">
						<CardTitle>{plan.name}</CardTitle>
						{plan.description && (
							<CardDescription>{plan.description}</CardDescription>
						)}
					</div>
					{plan.highlighted && <Badge>{localization.popular}</Badge>}
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-4">
				<div>
					<span className="text-2xl font-semibold tracking-tight">
						{formatPrice(price.amount, price.currency)}
					</span>
					{plan.seatBased && (
						<span className="ml-1 text-xs text-muted-foreground">{suffix}</span>
					)}
				</div>
				{plan.features?.length ? (
					<ul className="flex flex-col gap-2 text-sm">
						{plan.features.map((feature) => (
							<li key={feature} className="flex items-start gap-2">
								<Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
								<span>{feature}</span>
							</li>
						))}
					</ul>
				) : null}
			</CardContent>
			<CardFooter>
				<Button
					className="w-full"
					variant={isCurrent ? "outline" : "default"}
					disabled={isCurrent || isPending}
					onClick={() => onChoose(plan, price.id)}
				>
					{isCurrent ? localization.currentPlan : localization.choosePlan}
				</Button>
			</CardFooter>
		</Card>
	);
}

export function BillingSettings({
	adapter,
	scope,
	className,
	readOnly = false,
}: BillingSettingsProps) {
	const localization = useBillingLocalization();
	const plans = useBillingPlans(adapter, scope);
	const state = useBillingState(adapter, scope);
	const checkout = useBillingCheckout(adapter, scope);
	const portal = useBillingPortal(adapter, scope);
	const [interval, setInterval] = useState<BillingInterval>("month");
	const subscription = state.data?.subscription;
	const intervals = availableIntervals(plans.data ?? []);
	const resolvedInterval = intervals.includes(interval)
		? interval
		: (intervals[0] ?? "month");
	const intervalItems = intervals.map((value) => ({
		label:
			value === "month"
				? localization.perMonth
				: value === "year"
					? localization.perYear
					: localization.oneTime,
		value,
	}));
	const { t } = useTranslation();
	const error = plans.error ?? state.error ?? checkout.error ?? portal.error;
	return (
		<div className={cn("flex flex-col gap-6", className)}>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{apiErrorMessage(t, error)}
				</p>
			)}
			{readOnly && (
				<p className="text-sm text-muted-foreground">{t("billing.readOnly")}</p>
			)}
			<div className="flex flex-col gap-1">
				<h2 className="text-base font-semibold">{localization.billing}</h2>
				<p className="text-sm text-muted-foreground">
					{localization.billingDescription}
				</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-start justify-between gap-3">
						<div>
							<CardTitle>{localization.subscription}</CardTitle>
							<CardDescription>
								{subscription
									? (subscription.planName ?? subscription.planId)
									: localization.noSubscriptionDescription}
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{state.isPending ? (
						<div className="flex min-h-20 items-center justify-center">
							<Spinner />
							<span className="sr-only">{localization.loadingBilling}</span>
						</div>
					) : subscription ? (
						subscription.currentPeriodEnd && (
							<p className="text-sm text-muted-foreground">
								{localization.renewsOn.replace(
									"{{date}}",
									new Intl.DateTimeFormat(undefined, {
										dateStyle: "medium",
									}).format(subscription.currentPeriodEnd),
								)}
							</p>
						)
					) : (
						<p className="text-sm text-muted-foreground">
							{localization.noSubscription}
						</p>
					)}
				</CardContent>
				{subscription?.planId === "pro" && (
					<CardFooter className="flex-wrap gap-2">
						<Button
							variant="outline"
							disabled={
								readOnly ||
								state.isPending ||
								state.isError ||
								portal.isPending ||
								checkout.isPending ||
								subscription?.planId !== "pro"
							}
							onClick={() =>
								portal.mutate(undefined, { onSuccess: followBillingAction })
							}
						>
							{portal.isPending ? <Spinner /> : <ExternalLink />}
							{localization.manageBilling}
						</Button>
					</CardFooter>
				)}
			</Card>

			{state.data?.usage.length ? (
				<Card>
					<CardHeader>
						<CardTitle>{localization.usage}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{state.data.usage.map((usage) => (
							<div key={usage.id} className="flex flex-col gap-2">
								<div className="flex items-center justify-between gap-3 text-sm">
									<span className="font-medium">{usage.label}</span>
									<span className="text-muted-foreground">
										{usage.limit !== undefined
											? `${usage.used} / ${usage.limit}${usage.unit ? ` ${usage.unit}` : ""}`
											: localization.used.replace(
													"{{used}}",
													String(usage.used),
												)}
									</span>
								</div>
								{usage.id === "webhooks" && usage.limit === 0 && (
									<p className="text-xs text-muted-foreground">
										{t("billing.webhooksNotInPlan")}
									</p>
								)}
								<Progress
									value={
										usage.limit !== undefined
											? Math.min(100, (usage.used / usage.limit) * 100)
											: 0
									}
									aria-label={usage.label}
								/>
							</div>
						))}
					</CardContent>
				</Card>
			) : null}

			<section
				className="flex flex-col gap-3"
				aria-labelledby="billing-plans-heading"
			>
				<div className="flex items-end justify-between gap-3">
					<h3 id="billing-plans-heading" className="text-sm font-semibold">
						{localization.plans}
					</h3>
					{intervals.length > 1 && (
						<Select
							items={intervalItems}
							value={resolvedInterval}
							onValueChange={(value) => {
								if (!value) return;
								setInterval(value as BillingInterval);
							}}
						>
							<SelectTrigger className="w-36" aria-label={localization.plans}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{intervalItems.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					)}
				</div>
				{plans.isPending ? (
					<div className="flex min-h-40 items-center justify-center">
						<Spinner />
						<span className="sr-only">{localization.loadingBilling}</span>
					</div>
				) : (
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{plans.data?.map((plan) => (
							<PlanCard
								key={plan.id}
								plan={plan}
								interval={resolvedInterval}
								currentPlanId={subscription?.planId}
								isPending={
									readOnly ||
									state.isPending ||
									state.isError ||
									checkout.isPending ||
									portal.isPending
								}
								onChoose={(selectedPlan, priceId) =>
									checkout.mutate(
										{
											planId: selectedPlan.id,
											priceId,
											seats: selectedPlan.seatBased ? 1 : undefined,
										},
										{ onSuccess: followBillingAction },
									)
								}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
