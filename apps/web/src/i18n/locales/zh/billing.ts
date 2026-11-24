import type en from "../en";

const billing: typeof en.billing = {
	choosePlan: "选择套餐",
	usage: "用量",
	used: "已使用 {{used}}",
	currentPlan: "当前方案",
	planFree: "Free",
	planPro: "Pro",
	usageOf: "{{current}} / {{cap}}",
	webhooksNotInPlan: "Free 计划不含 Webhooks。",
	upgradeToUnlock: "升级解锁",
	recommended: "推荐",
	renewsOn: "{{date}} 续期",
	limits: {
		members: "成员",
		projects: "项目",
		webhooks: "Webhooks",
		storage: "存储空间",
	},
	attachmentSize: "附件大小",
	apiRateLimit: "API 速率限制",
	megabytes: "{{value}} MB",
	perMinute: "{{value}} / 分钟",
	compareTitle: "方案对比",
	compareDescription: "各方案包含的额度。",
	feature: "功能",
	price: "价格",
	pricePerMember: "每成员每月 {{price}}",
	upgrade: "升级到 Pro",
	manageBilling: "管理账单",
	readOnly: "只有所有者或管理员可以更改方案。",
	downgrade: "降级到 Free",
	mockUpgradeTitle: "升级到 Pro？",
	mockUpgradeDescription:
		"Pro 方案价格为每成员 {{price}} / 月。本实例未配置 Stripe，升级为模拟操作。你的组织将立即切换为 Pro 方案。",
	mockDowngradeTitle: "降级到 Free？",
	mockDowngradeDescription:
		"本实例未配置 Stripe，降级为模拟操作。如果组织用量超过 Free 方案的限制，超出限制的成员、项目和 Webhooks 将无法继续使用。",
	checkoutCanceled: "支付已取消。",
	dismiss: "关闭",
};

export default billing;
