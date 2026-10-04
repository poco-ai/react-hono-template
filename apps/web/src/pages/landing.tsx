import { Link } from "@tanstack/react-router";
import { PLANS, type PlanLimits } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import { Building2, CreditCard, ListTodo, Webhook } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDocumentTitle } from "@/lib/use-document-title";

const MB = 1024 * 1024;

export function LandingPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("landing.title"));

	const features = [
		{
			icon: Building2,
			title: t("landing.features.orgs.title"),
			description: t("landing.features.orgs.description"),
		},
		{
			icon: ListTodo,
			title: t("landing.features.issues.title"),
			description: t("landing.features.issues.description"),
		},
		{
			icon: Webhook,
			title: t("landing.features.developer.title"),
			description: t("landing.features.developer.description"),
		},
		{
			icon: CreditCard,
			title: t("landing.features.billing.title"),
			description: t("landing.features.billing.description"),
		},
	];

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
			key: "attachmentSize",
			label: t("billing.attachmentSize"),
			value: t("billing.megabytes", { value: limits.attachmentMaxSize / MB }),
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
		<div className="bg-background flex min-h-svh flex-col">
			<header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
				<div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
					<Link to="/" className="shrink-0">
						<Logo />
					</Link>
					<div className="flex items-center gap-1">
						<LanguageSwitcher />
						<ThemeToggle />
						<Link
							to="/login"
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"ml-1",
							)}
						>
							{t("landing.ctaSecondary")}
						</Link>
					</div>
				</div>
			</header>

			<main className="flex-1">
				<section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-12 text-center sm:pt-24">
					<Badge variant="outline">{t("landing.badge")}</Badge>
					<h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
						{t("landing.title")}
					</h1>
					<p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-balance sm:text-lg">
						{t("landing.subtitle")}
					</p>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<Link
							to="/register"
							className={cn(buttonVariants(), "h-10 px-5 text-sm")}
						>
							{t("landing.ctaPrimary")}
						</Link>
						<Link
							to="/login"
							className={cn(
								buttonVariants({ variant: "outline" }),
								"h-10 px-5 text-sm",
							)}
						>
							{t("landing.ctaSecondary")}
						</Link>
					</div>
				</section>

				<section className="mx-auto w-full max-w-5xl px-6 py-14">
					<h2 className="text-center text-2xl font-semibold tracking-tight">
						{t("landing.featuresTitle")}
					</h2>
					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{features.map((feature) => (
							<Card key={feature.title}>
								<CardHeader>
									<feature.icon className="text-primary mb-2 size-5" />
									<CardTitle>{feature.title}</CardTitle>
									<CardDescription>{feature.description}</CardDescription>
								</CardHeader>
							</Card>
						))}
					</div>
				</section>

				<section className="mx-auto w-full max-w-5xl px-6 py-14">
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
											<Badge variant="secondary">
												{t("billing.recommended")}
											</Badge>
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
												<span className="text-muted-foreground">
													{row.label}
												</span>
												<span className="font-medium">{row.value}</span>
											</li>
										))}
									</ul>
								</CardContent>
							</Card>
						))}
					</div>
				</section>
			</main>

			<footer className="border-t">
				<div className="text-muted-foreground mx-auto w-full max-w-5xl px-6 py-8 text-center text-sm">
					{t("landing.footer")}
				</div>
			</footer>
		</div>
	);
}
