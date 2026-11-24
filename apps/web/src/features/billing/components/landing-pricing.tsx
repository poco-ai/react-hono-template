import { PLANS, type PlanLimits } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { useTranslation } from "react-i18next";

const MB = 1024 * 1024;

/** Landing pricing section, contributed only when billing is enabled. */
export function LandingPricing() {
	const { t } = useTranslation();

	const limitRows = (limits: PlanLimits) => [
		{
			key: "members",
			label: t("billing.limits.members"),
			value: String(limits.members),
		},
		{
			key: "projects",
			label: t("billing.limits.projects"),
			value: String(limits.projects),
		},
		{
			key: "storage",
			label: t("billing.limits.storage"),
			value: t("billing.megabytes", { value: limits.storageBytes / MB }),
		},
		{
			key: "attachmentSize",
			label: t("billing.attachmentSize"),
			value: t("billing.megabytes", {
				value: limits.attachmentMaxSize / MB,
			}),
		},
		{
			key: "apiRateLimit",
			label: t("billing.apiRateLimit"),
			value: t("billing.perMinute", { value: limits.apiRateLimit }),
		},
		{
			key: "webhooks",
			label: t("billing.limits.webhooks"),
			value: String(limits.webhooks),
		},
	];

	const plans = [
		{
			key: "free",
			name: t("billing.planFree"),
			price: `$${PLANS.free.price}`,
			plan: PLANS.free,
		},
		{
			key: "pro",
			name: t("billing.planPro"),
			price: t("billing.pricePerMember", {
				price: `$${PLANS.pro.price}`,
			}),
			plan: PLANS.pro,
		},
	];

	return (
		<section
			id="pricing"
			className="mx-auto w-full max-w-5xl scroll-mt-16 px-6 py-14"
		>
			<h2 className="text-center text-2xl font-semibold tracking-tight">
				{t("landing.pricingTitle")}
			</h2>
			<p className="text-muted-foreground mt-2 text-center text-sm">
				{t("landing.pricingDescription")}
			</p>
			<div className="mt-8 grid gap-4 md:grid-cols-2">
				{plans.map((plan) => (
					<Card
						key={plan.key}
						className={plan.key === "pro" ? "ring-primary/40" : undefined}
					>
						<CardHeader>
							<CardTitle className="flex items-center justify-between gap-2">
								{plan.name}
								{plan.key === "pro" && (
									<Badge variant="secondary">{t("billing.recommended")}</Badge>
								)}
							</CardTitle>
							<CardDescription className="text-foreground text-lg font-semibold">
								{plan.price}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="flex flex-col gap-2">
								{limitRows(plan.plan).map((row) => (
									<li
										key={row.key}
										className="flex items-baseline justify-between gap-4"
									>
										<span className="text-muted-foreground">{row.label}</span>
										<span className="font-medium">{row.value}</span>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}
