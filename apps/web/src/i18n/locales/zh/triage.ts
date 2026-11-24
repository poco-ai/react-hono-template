import type en from "../en";

const triage: typeof en.triage = {
	title: "待分诊",
	allProjects: "全部项目",
	clearFilter: "清除筛选",
	queueCount: "队列中 {{count}} 条",
	selectAll: "全选",
	selectIssue: "选择 {{identifier}}",
	accept: "接受",
	decline: "拒绝",
	acceptSelected: "接受所选",
	declineSelected: "拒绝所选",
	createdAt: "创建于 {{date}}",
	createdBy: "由 {{name}} 创建",
	missingUnstarted: "组织没有「未开始」状态，请先在组织设置中添加。",
	missingCanceled: "组织没有「已取消」状态，请先在组织设置中添加。",
	empty: "队列已清空",
	emptyDescription: "当前没有等待负责人的待办事项。",
};

export default triage;
