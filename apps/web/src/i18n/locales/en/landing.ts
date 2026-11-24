const landing = {
	badge: "Open-source SaaS starter",
	title: "Launch your SaaS on Cloudflare's edge",
	subtitle:
		"React + Hono + D1. Multi-tenant organizations, plans, API keys and webhooks — ready to rebrand.",
	ctaPrimary: "Get started",
	ctaSecondary: "Sign in",
	nav: {
		features: "Features",
		pricing: "Pricing",
		faq: "FAQ",
	},
	preview: {
		allIssues: "All issues",
		newIssue: "New issue",
		nav: {
			inbox: "Inbox",
			issues: "Issues",
			projects: "Projects",
			roadmap: "Roadmap",
		},
		issues: {
			sso: {
				title: "Add SSO to workspace settings",
				meta: "Feature · Backlog",
			},
			webhooks: {
				title: "Fix webhook retry backoff",
				meta: "Bug · In progress",
			},
			darkMode: {
				title: "Ship dark mode tokens",
				meta: "Chore · Done",
			},
			rateLimit: {
				title: "Rate-limit the public API",
				meta: "Feature · In progress",
			},
		},
	},
	featuresTitle: "Everything a SaaS needs",
	features: {
		orgs: {
			title: "Multi-tenant organizations",
			description:
				"Roles, invitations and freeze controls, scoped per organization.",
		},
		issues: {
			title: "Issue tracking",
			description: "List and board views, labels, estimates and due dates.",
		},
		developer: {
			title: "Public API & webhooks",
			description:
				"Bearer API keys with rate limits, plus signed webhook deliveries.",
		},
		billing: {
			title: "Plans & billing",
			description:
				"Stripe-ready subscriptions with per-plan quotas. Mock mode included.",
		},
		ai: {
			title: "AI assistant & MCP",
			description:
				"Org-scoped AI chat with tool-call approval, plus an OAuth-secured MCP server.",
			chat: {
				user: "Summarize this week's blockers",
				assistant:
					"Two items need attention: webhook retries keep failing and the API rate limiter needs tuning. Want me to open an issue?",
				tool: "Approval required · create_issue",
			},
		},
		deploy: {
			title: "Deploy your way",
			description:
				"Push to main and CI ships it to Cloudflare Workers — or self-host with Bun, PostgreSQL, Redis and S3.",
		},
	},
	pricingTitle: "Simple pricing",
	pricingDescription: "Start on Free, upgrade when your team grows.",
	faqTitle: "Frequently asked questions",
	faq: {
		items: {
			deploy: {
				question: "Where can I deploy it?",
				answer:
					"Cloudflare Workers is the default: pushing to main triggers GitHub Actions to deploy the API and web app. The same API also self-hosts with Bun, PostgreSQL, Redis and S3-compatible storage.",
			},
			billing: {
				question: "Do I need a Stripe account?",
				answer:
					"No. Without Stripe keys the billing service runs in mock mode, so you can build and test the whole upgrade flow locally. Add your keys when you're ready to charge.",
			},
			ai: {
				question: "Which AI providers are supported?",
				answer:
					"Any OpenAI-compatible endpoint: set AI_BASE_URL, AI_API_KEY and AI_MODEL. An offline mock provider keeps chat and MCP testable without any keys.",
			},
			auth: {
				question: "What does authentication include?",
				answer:
					"better-auth covers email and password, email OTP, password reset and OAuth2, with organization roles, invitations, bans and admin guards already wired up.",
			},
			quality: {
				question: "How is it tested?",
				answer:
					"Focused regression suites cover auth, quotas, routing and web data caching, and run as part of the same quality gate in CI.",
			},
		},
	},
	cta: {
		title: "Ready to ship your next SaaS?",
		subtitle: "Clone, rebrand, deploy — the boring parts are already done.",
		button: "Start building",
	},
	footer: "Built with React, Hono, Drizzle and better-auth.",
};

export default landing;
