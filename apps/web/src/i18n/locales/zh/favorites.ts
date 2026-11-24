import type en from "../en";

const favorites: typeof en.favorites = {
	title: "收藏",
	description: "你置顶的事项和项目，收藏仅对你可见。",
	empty: "还没有收藏",
	emptyDescription: "为事项或项目加星，即可一键直达。",
	issues_one: "事项 · {{count}}",
	issues_other: "事项 · {{count}}",
	projects_one: "项目 · {{count}}",
	projects_other: "项目 · {{count}}",
	addIssue: "收藏该事项",
	removeIssue: "取消收藏该事项",
	addProject: "收藏该项目",
	removeProject: "取消收藏该项目",
	archivedIssue: "请先恢复该事项，再收藏。",
	archivedProject: "请先取消归档该项目，再收藏。",
	removed: "已取消收藏。",
};

export default favorites;
