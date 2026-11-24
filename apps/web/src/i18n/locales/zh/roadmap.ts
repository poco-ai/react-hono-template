import type en from "../en";

const roadmap: typeof en.roadmap = {
	title: "路线图",
	projectsColumn: "项目",
	issueCount: "{{open}} 未完成 / 共 {{total}}",
	target: "目标 {{date}}",
	targetMarker: "目标日期 {{date}}",
	cycleProgress: "{{percent}}% · {{total}} 个事项",
	cycleRange: "{{start}} 至 {{end}}",
	openCycle: "在项目事项中打开 {{name}}",
	truncated: "时间窗口已按 12 个月截断",
	empty: "暂无可展示的项目",
	emptyDescription: "创建项目后即可在路线图中规划。已归档项目不会显示。",
};

export default roadmap;
