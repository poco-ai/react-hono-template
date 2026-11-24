import type en from "../en";

const templates: typeof en.templates = {
	description:
		"新建事项的预填内容。项目模板出现在该项目的创建对话框中，组织级模板在所有项目中可用。",
	create: "新建模板",
	createTitle: "创建模板",
	editTitle: "编辑模板",
	createDescription: "选择新建事项时要预填的字段，所有字段之后仍可修改。",
	editDescription: "更新此模板预填的默认值。",
	name: "模板名称",
	namePlaceholder: "例如：缺陷报告",
	scope: "适用范围",
	orgWide: "整个组织",
	title: "事项标题",
	noStatus: "项目默认状态",
	labelCount: "标签：{{count}} 个",
	estimateValue: "{{count}} 点",
	estimateHint: "使用此模板创建事项时的可选初始估点。",
	empty: "还没有模板。",
	deleteTitle: "删除模板？",
	deleteDescription: "将删除“{{name}}”。已用它创建的事项不受影响。",
};

export default templates;
