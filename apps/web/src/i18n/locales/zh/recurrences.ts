import type en from "../en";

const recurrences: typeof en.recurrences = {
	title: "周期任务",
	makeRecurring: "设为周期任务",
	makeRecurringDescription:
		"按重复计划从 {{key}} 自动创建新事项。周期任务会保存此事项字段的快照。",
	cadenceLabel: "重复频率",
	cadence: {
		daily: "每天",
		weekly: "每周",
		monthly: "每月",
	},
	firstRun: "首次运行",
	preview: "将从 {{date}} 开始{{cadence}}创建新事项。",
	createAction: "创建周期任务",
	nextRun: "下次运行",
	active: "启用中",
	paused: "已暂停",
	pause: "暂停",
	resume: "恢复",
	editCadence: "修改频率",
	delete: "删除周期任务",
	deleteTitle: "删除周期任务？",
	deleteDescription: "将删除“{{title}}”。已经创建的事项不受影响。",
	emptyTitle: "还没有周期任务",
	emptyDescription: "在事项菜单中选择“设为周期任务”即可创建。",
	frozenHint: "组织已冻结，周期任务暂时只读，结清账单后恢复写入。",
};

export default recurrences;
