import type en from "../en";

const adminOrgs: typeof en.adminOrgs = {
	title: "组织管理",
	searchPlaceholder: "按名称或 Slug 搜索…",
	org: "组织",
	plan: "方案",
	planFree: "免费",
	planPro: "专业版",
	members: "成员",
	issues: "事项",
	created: "创建时间",
	status: "状态",
	actions: "操作",
	frozen: "已冻结",
	active: "正常",
	freeze: "冻结",
	unfreeze: "解冻",
	freezeTitle: "冻结组织？",
	freezeDescription: "{{name}} 将被冻结，在解冻之前其成员无法进行任何更改。",
	orgCount: "{{total}} 个组织",
	quota: "额度",
	quotaTitle: "积分与价目",
	grant: "调整积分",
	amount: "数量",
	reason: "原因",
	savePolicy: "保存价目",
	meter: "表计",
	included: "包含量",
	creditRate: "每积分对应单位",
};

export default adminOrgs;
