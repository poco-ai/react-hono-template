import type en from "../en";

const activity: typeof en.activity = {
	title: "动态",
	empty: "暂无动态。",
	emptyValue: "无",
	unknownUser: "未知用户",
	unknownAction: "{{action}}",
	issue: {
		created: "{{name}} 创建了该事项",
		deleted: "{{name}} 删除了该事项",
		updated: "{{name}} 将{{field}}从 {{from}} 改为 {{to}}",
		descriptionChanged: "{{name}} 更新了描述",
		commentResolved: "{{name}} 将评论标记为已解决",
		archived: "{{name}} 归档了该事项",
		restored: "{{name}} 恢复了该事项",
		relationAdded: "{{name}} 添加了指向 {{issue}} 的{{type}}关联",
		relationRemoved: "{{name}} 移除了指向 {{issue}} 的{{type}}关联",
	},
	fields: {
		title: "标题",
		description: "描述",
		status: "状态",
		priority: "优先级",
		assignee: "经办人",
		labels: "标签",
		dueDate: "截止日期",
		estimate: "预估",
		parent: "父事项",
		cycle: "周期",
		archived: "归档状态",
		commentResolved: "评论解决状态",
		relationBlocks: "阻塞",
		relationBlockedBy: "被阻塞",
		relationRelated: "相关",
		relationDuplicates: "重复",
	},
	comment: {
		created: "{{name}} 发表了评论",
	},
	attachment: {
		added: "{{name}} 添加了附件 {{filename}}",
		removed: "{{name}} 移除了附件 {{filename}}",
	},
};

export default activity;
