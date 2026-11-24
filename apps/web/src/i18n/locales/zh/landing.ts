import type en from "../en";

const landing: typeof en.landing = {
	badge: "开源 SaaS 模板",
	title: "在 Cloudflare 边缘上发布你的 SaaS",
	subtitle:
		"React + Hono + D1。多租户组织、套餐、API 密钥与 Webhooks，开箱即可换皮。",
	ctaPrimary: "开始使用",
	ctaSecondary: "登录",
	nav: {
		features: "功能",
		pricing: "定价",
		faq: "常见问题",
	},
	preview: {
		allIssues: "全部事项",
		newIssue: "新建事项",
		nav: {
			inbox: "收件箱",
			issues: "事项",
			projects: "项目",
			roadmap: "路线图",
		},
		issues: {
			sso: {
				title: "为工作区设置接入 SSO",
				meta: "功能 · 待办",
			},
			webhooks: {
				title: "修复 Webhook 重试退避",
				meta: "缺陷 · 进行中",
			},
			darkMode: {
				title: "发布暗色主题变量",
				meta: "杂务 · 已完成",
			},
			rateLimit: {
				title: "为公开 API 加上速率限制",
				meta: "功能 · 进行中",
			},
		},
	},
	featuresTitle: "一个 SaaS 需要的全部",
	features: {
		orgs: {
			title: "多租户组织",
			description: "按组织隔离的角色、邀请与冻结控制。",
		},
		issues: {
			title: "事项追踪",
			description: "列表与看板视图，标签、预估与截止日期。",
		},
		developer: {
			title: "公开 API 与 Webhooks",
			description: "带速率限制的 Bearer 密钥，以及签名 Webhook 投递。",
		},
		billing: {
			title: "套餐与计费",
			description: "Stripe 就绪的订阅与配额，内置模拟模式。",
		},
		ai: {
			title: "AI 助手与 MCP",
			description:
				"按组织隔离的 AI 聊天（工具调用需审批），外加 OAuth 保护的 MCP 服务器。",
			chat: {
				user: "总结一下本周的阻塞项",
				assistant:
					"有两件事需要关注：Webhook 重试持续失败，API 限流参数需要调优。要我创建一条事项吗？",
				tool: "需要审批 · create_issue",
			},
		},
		deploy: {
			title: "按你的方式部署",
			description:
				"推送到 main 即由 CI 部署到 Cloudflare Workers，也可以用 Bun、PostgreSQL、Redis 与 S3 自托管。",
		},
	},
	pricingTitle: "简单定价",
	pricingDescription: "免费开始，团队变大时再升级。",
	faqTitle: "常见问题",
	faq: {
		items: {
			deploy: {
				question: "可以在哪里部署？",
				answer:
					"默认部署到 Cloudflare Workers：推送到 main 分支，GitHub Actions 会自动部署 API 与前端。同一套 API 也支持用 Bun、PostgreSQL、Redis 和 S3 兼容存储自托管。",
			},
			billing: {
				question: "必须有 Stripe 账号吗？",
				answer:
					"不需要。没有 Stripe 密钥时计费服务运行在模拟模式，本地就能完整体验升级流程；准备收款时再填入密钥。",
			},
			ai: {
				question: "支持哪些 AI 提供商？",
				answer:
					"任何 OpenAI 兼容接口都可以：配置 AI_BASE_URL、AI_API_KEY 和 AI_MODEL 即可。离线 mock 提供商让聊天与 MCP 不需要密钥也能测试。",
			},
			auth: {
				question: "认证包含哪些能力？",
				answer:
					"better-auth 覆盖邮箱密码、邮件验证码、密码重置与 OAuth2，组织角色、邀请、封禁和管理员防护也已全部接好。",
			},
			quality: {
				question: "测试覆盖情况如何？",
				answer:
					"针对认证、配额、路由与前端数据缓存的回归测试套件，会作为 CI 质量门禁的一部分运行。",
			},
		},
	},
	cta: {
		title: "准备好发布下一个 SaaS 了吗？",
		subtitle: "克隆、换皮、部署——枯燥的部分已经替你做完了。",
		button: "开始构建",
	},
	footer: "基于 React、Hono、Drizzle 与 better-auth 构建。",
};

export default landing;
