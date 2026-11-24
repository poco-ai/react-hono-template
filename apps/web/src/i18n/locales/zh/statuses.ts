import type en from "../en";

const statuses: typeof en.statuses = {
	description: "工作流状态由组织内所有项目共享，用于看板列、筛选和事项进度。",
	create: "新建状态",
	createTitle: "创建状态",
	editTitle: "编辑状态",
	createDescription: "为组织的工作流增加一个阶段。",
	editDescription: "修改该工作流状态的名称、分类或颜色。",
	name: "名称",
	namePlaceholder: "例如：待测试",
	category: "分类",
	color: "颜色",
	default: "默认",
	setDefault: "设为默认",
	edit: "编辑状态",
	moveUp: "上移",
	moveDown: "下移",
	empty: "还没有状态。",
	lastStatusHint: "组织必须至少保留一个状态。",
	deleteTitle: "删除状态 {{name}}？",
	deleteDescription:
		"使用该状态的事项将迁移到你选择的另一个状态。此操作无法撤销。",
	migrateTo: "迁移事项到",
	migratePlaceholder: "选择状态",
	categories: {
		backlog: "待办池",
		unstarted: "未开始",
		started: "进行中",
		completed: "已完成",
		canceled: "已取消",
	},
};

export default statuses;
