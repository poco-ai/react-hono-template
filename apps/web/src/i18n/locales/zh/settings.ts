import type en from "../en";

const settings: typeof en.settings = {
	noPermission: "你没有权限访问该设置页。",
	general: "常规",
	members: "成员",
	labels: "标签",
	statuses: "状态",
	templates: "模板",
	ai: "AI",
	mcp: "MCP",
	apiKeys: "API 密钥",
	webhooks: "Webhooks",
	billing: "订阅与账单",
	audit: "审计",
	orgName: "组织名称",
	slug: "Slug",
	save: "保存更改",
	updateFailed: "更新组织失败",
	dangerZone: "危险操作",
	leaveTitle: "退出组织",
	leaveDescription: "你将失去该组织中所有项目的访问权限。",
	leaveButton: "退出组织",
	leaveConfirmTitle: "退出组织？",
	leaveConfirmDescription:
		"确定要退出 {{name}} 吗？如需重新加入，必须再次收到邀请。",
	soleOwnerHint: "唯一的所有者不能退出。请先转移所有权，或直接删除组织。",
	deleteTitle: "删除组织",
	deleteDescription: "将永久删除该组织及其所有项目和事项，此操作不可撤销。",
	deleteDialogTitle: "删除组织",
	deleteDialogDescription:
		"这将永久删除 {{name}} 及其中的所有内容。请输入组织名称以确认。",
	deleteButton: "删除组织",
};

export default settings;
