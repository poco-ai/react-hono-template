import type en from "../en";

const command: typeof en.command = {
	trigger: "搜索…",
	title: "命令面板",
	description: "输入命令或搜索…",
	placeholder: "搜索或跳转…",
	empty: "没有找到结果。",
	groups: {
		goto: "跳转",
		projects: "项目",
		issues: "事项",
		comments: "评论",
		people: "成员",
		recent: "最近访问",
		actions: "操作",
	},
	search: {
		searching: "搜索中…",
		failed: "搜索失败。",
		retry: "重试",
		memberNoProject: "请先打开一个项目，再按负责人筛选事项。",
	},
	goToProjects: "项目",
	goToInbox: "收件箱",
	goToMyIssues: "我的事项",
	goToActivity: "动态",
	settingsGeneral: "设置 — 常规",
	settingsMembers: "设置 — 成员",
	settingsLabels: "设置 — 标签",
	settingsApiKeys: "设置 — API 密钥",
	settingsWebhooks: "设置 — Webhooks",
	settingsBilling: "设置 — 账单",
	goToApiDocs: "API 文档",
	newProject: "新建项目",
	newIssue: "新建事项",
	goToAdmin: "管理后台",
	askAi: "询问 AI",
};

export default command;
