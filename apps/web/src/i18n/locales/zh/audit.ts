import type en from "../en";

const audit: typeof en.audit = {
	action: "动作",
	actor: "操作者",
	target: "对象",
	time: "时间",
	result: "结果",
	allActions: "全部动作",
	actorPlaceholder: "操作者 ID",
	from: "开始",
	to: "结束",
	export: "导出 CSV",
	empty: "还没有审计事件。",
	actions: {
		"member.invited": "邀请成员",
		"member.removed": "移除成员",
		"member.role_changed": "变更成员角色",
		"apikey.created": "创建 API 密钥",
		"apikey.revoked": "撤销 API 密钥",
		"billing.plan_changed": "变更套餐",
		"quota.adjusted": "调整积分",
		"quota.policy_changed": "变更价目",
		"webhook.created": "创建 Webhook",
		"webhook.deleted": "删除 Webhook",
		"ai.settings_changed": "变更 AI 设置",
	},
};

export default audit;
