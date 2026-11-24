import { Link } from "@tanstack/react-router";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@workspace/ui/components/accordion";
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
import {
	Bot,
	Building2,
	CheckCircle2,
	CircleDot,
	CloudCog,
	CreditCard,
	Folder,
	Inbox,
	ListTodo,
	MapIcon,
	ShieldCheck,
	Webhook,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { webLandingPricing } from "@/features/registry";
import { useDocumentTitle } from "@/lib/use-document-title";

export function LandingPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("landing.title"));
	const LandingPricing = webLandingPricing();

	const featureCards = [
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

	const faqItems = [
		{
			value: "deploy",
			question: t("landing.faq.items.deploy.question"),
			answer: t("landing.faq.items.deploy.answer"),
		},
		{
			value: "billing",
			question: t("landing.faq.items.billing.question"),
			answer: t("landing.faq.items.billing.answer"),
		},
		{
			value: "ai",
			question: t("landing.faq.items.ai.question"),
			answer: t("landing.faq.items.ai.answer"),
		},
		{
			value: "auth",
			question: t("landing.faq.items.auth.question"),
			answer: t("landing.faq.items.auth.answer"),
		},
		{
			value: "quality",
			question: t("landing.faq.items.quality.question"),
			answer: t("landing.faq.items.quality.answer"),
		},
	];

	return (
		<div className="bg-background flex min-h-svh flex-col">
			<header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
				<div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
					<Link to="/" className="shrink-0">
						<Logo />
					</Link>
					<nav className="text-muted-foreground hidden items-center gap-6 text-sm md:flex">
						<a
							className="hover:text-foreground transition-colors"
							href="#features"
						>
							{t("landing.nav.features")}
						</a>
						<a
							className="hover:text-foreground transition-colors"
							href="#pricing"
						>
							{t("landing.nav.pricing")}
						</a>
						<a className="hover:text-foreground transition-colors" href="#faq">
							{t("landing.nav.faq")}
						</a>
					</nav>
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
				{/* Hero + product preview */}
				<section className="relative overflow-x-clip">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]"
					>
						<div className="bg-primary/15 absolute left-1/2 top-0 size-[560px] -translate-x-[75%] rounded-full blur-[110px]" />
						<div className="bg-primary/10 absolute left-1/2 top-0 size-[420px] translate-x-[70%] rounded-full blur-[110px]" />
					</div>
					<div className="mx-auto w-full max-w-3xl px-6 pt-16 text-center sm:pt-24">
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
						<p className="text-muted-foreground/70 mt-6 text-xs tracking-wide">
							React 19 · Hono · Cloudflare Workers · D1 · Drizzle · better-auth
						</p>
					</div>
					<div className="mx-auto w-full max-w-4xl px-6 pt-12 pb-16">
						<ProductPreview />
					</div>
				</section>

				{/* Features */}
				<section
					id="features"
					className="mx-auto w-full max-w-5xl scroll-mt-16 px-6 py-14"
				>
					<h2 className="text-center text-2xl font-semibold tracking-tight">
						{t("landing.featuresTitle")}
					</h2>
					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<Card className="sm:col-span-2">
							<CardHeader>
								<Bot className="text-primary mb-2 size-5" />
								<CardTitle>{t("landing.features.ai.title")}</CardTitle>
								<CardDescription>
									{t("landing.features.ai.description")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<AiChatMock />
							</CardContent>
						</Card>
						{featureCards.map((feature) => (
							<Card key={feature.title}>
								<CardHeader>
									<feature.icon className="text-primary mb-2 size-5" />
									<CardTitle>{feature.title}</CardTitle>
									<CardDescription>{feature.description}</CardDescription>
								</CardHeader>
							</Card>
						))}
						<Card className="sm:col-span-2 lg:col-span-3">
							<CardContent className="grid gap-6 p-6 md:grid-cols-2 md:items-center">
								<div>
									<CloudCog className="text-primary mb-2 size-5" />
									<h3 className="font-semibold">
										{t("landing.features.deploy.title")}
									</h3>
									<p className="text-muted-foreground mt-1 text-sm">
										{t("landing.features.deploy.description")}
									</p>
								</div>
								<TerminalMock />
							</CardContent>
						</Card>
					</div>
				</section>

				{LandingPricing ? <LandingPricing /> : null}

				{/* FAQ */}
				<section
					id="faq"
					className="mx-auto w-full max-w-3xl scroll-mt-16 px-6 py-14"
				>
					<h2 className="text-center text-2xl font-semibold tracking-tight">
						{t("landing.faqTitle")}
					</h2>
					<Accordion className="mt-8 text-left">
						{faqItems.map((item) => (
							<AccordionItem key={item.value} value={item.value}>
								<AccordionTrigger>{item.question}</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									{item.answer}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</section>

				{/* Final CTA */}
				<section className="mx-auto w-full max-w-5xl px-6 pt-4 pb-20">
					<div className="bg-card relative overflow-hidden rounded-2xl border px-6 py-14 text-center sm:py-16">
						<div
							aria-hidden="true"
							className="pointer-events-none absolute inset-0"
						>
							<div className="bg-primary/10 absolute left-1/2 top-0 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]" />
						</div>
						<h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
							{t("landing.cta.title")}
						</h2>
						<p className="text-muted-foreground mx-auto mt-3 max-w-xl text-balance">
							{t("landing.cta.subtitle")}
						</p>
						<div className="mt-7 flex justify-center">
							<Link
								to="/register"
								className={cn(buttonVariants({ size: "lg" }), "px-6")}
							>
								{t("landing.cta.button")}
							</Link>
						</div>
					</div>
				</section>
			</main>

			<footer className="border-t">
				<div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-6 py-8 text-center">
					<Logo />
					<p className="text-muted-foreground text-sm">{t("landing.footer")}</p>
				</div>
			</footer>
		</div>
	);
}

function ProductPreview() {
	const { t } = useTranslation();

	const navItems = [
		{ icon: Inbox, label: t("landing.preview.nav.inbox"), active: false },
		{ icon: ListTodo, label: t("landing.preview.nav.issues"), active: true },
		{ icon: Folder, label: t("landing.preview.nav.projects"), active: false },
		{ icon: MapIcon, label: t("landing.preview.nav.roadmap"), active: false },
	];

	const rows = [
		{
			title: t("landing.preview.issues.sso.title"),
			meta: t("landing.preview.issues.sso.meta"),
			done: false,
			assignee: "Q",
		},
		{
			title: t("landing.preview.issues.webhooks.title"),
			meta: t("landing.preview.issues.webhooks.meta"),
			done: false,
			assignee: "M",
		},
		{
			title: t("landing.preview.issues.darkMode.title"),
			meta: t("landing.preview.issues.darkMode.meta"),
			done: true,
			assignee: "A",
		},
		{
			title: t("landing.preview.issues.rateLimit.title"),
			meta: t("landing.preview.issues.rateLimit.meta"),
			done: false,
			assignee: "J",
		},
	];

	return (
		<div
			aria-hidden="true"
			className="bg-card mx-auto overflow-hidden rounded-xl border shadow-2xl"
		>
			<div className="flex h-10 items-center border-b px-4">
				<span className="bg-border size-2.5 rounded-full" />
				<span className="bg-border ml-1.5 size-2.5 rounded-full" />
				<span className="bg-border ml-1.5 size-2.5 rounded-full" />
				<span className="bg-muted mx-auto h-5 w-44 rounded-full" />
			</div>
			<div className="grid text-left sm:grid-cols-[176px_1fr]">
				<aside className="hidden flex-col gap-1 border-r p-3 sm:flex">
					<div className="mb-2 flex items-center gap-2 px-2 py-1">
						<span className="bg-primary/15 text-primary flex size-5 items-center justify-center rounded-md text-[10px] font-semibold">
							A
						</span>
						<span className="text-xs font-medium">Acme</span>
					</div>
					{navItems.map((item) => (
						<span
							key={item.label}
							className={cn(
								"flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
								item.active
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground",
							)}
						>
							<item.icon className="size-3.5" />
							{item.label}
						</span>
					))}
				</aside>
				<div className="p-4 sm:p-5">
					<div className="flex items-center justify-between gap-4">
						<span className="text-sm font-semibold">
							{t("landing.preview.allIssues")}
						</span>
						<span className="bg-primary text-primary-foreground inline-flex h-6 items-center rounded-md px-2.5 text-xs font-medium">
							{t("landing.preview.newIssue")}
						</span>
					</div>
					<div className="mt-3">
						{rows.map((row) => (
							<div
								key={row.title}
								className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
							>
								{row.done ? (
									<CheckCircle2 className="text-primary size-4 shrink-0" />
								) : (
									<CircleDot className="text-muted-foreground size-4 shrink-0" />
								)}
								<span
									className={cn(
										"truncate text-sm",
										row.done && "text-muted-foreground line-through",
									)}
								>
									{row.title}
								</span>
								<span className="text-muted-foreground ml-auto hidden whitespace-nowrap text-xs md:block">
									{row.meta}
								</span>
								<span className="bg-primary/15 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
									{row.assignee}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function AiChatMock() {
	const { t } = useTranslation();

	return (
		<div aria-hidden="true" className="rounded-lg border bg-muted/40 p-3">
			<div className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-lg px-3 py-1.5 text-xs">
				{t("landing.features.ai.chat.user")}
			</div>
			<div className="bg-background mt-2 w-fit max-w-[90%] rounded-lg border px-3 py-1.5 text-xs">
				{t("landing.features.ai.chat.assistant")}
			</div>
			<div className="mt-2.5 flex items-center">
				<Badge
					variant="outline"
					className="text-muted-foreground gap-1.5 font-normal"
				>
					<ShieldCheck className="size-3" />
					{t("landing.features.ai.chat.tool")}
				</Badge>
			</div>
		</div>
	);
}

function TerminalMock() {
	return (
		<div
			aria-hidden="true"
			dir="ltr"
			className="rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed"
		>
			<p className="text-muted-foreground">$ bun install</p>
			<p className="text-muted-foreground">$ bun run dev</p>
			<p>
				<span className="text-primary">✔</span> api&nbsp;&nbsp;→
				http://localhost:8787
			</p>
			<p>
				<span className="text-primary">✔</span> web&nbsp;&nbsp;→
				http://localhost:5173
			</p>
			<p className="text-muted-foreground">
				$ git push origin main{" "}
				<span className="text-foreground"># CI deploys to Workers</span>
			</p>
		</div>
	);
}
