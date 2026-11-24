import type en from "../en";

const comments: typeof en.comments = {
	title: "评论",
	count_one: "{{count}} 条评论",
	count_other: "{{count}} 条评论",
	empty: "还没有评论，来说第一句吧。",
	placeholder: "发表评论…",
	post: "评论",
	previewEmpty: "暂无可预览的内容。",
	charCount: "{{count}} / {{max}}",
	edited: "已编辑",
	deleteTitle: "删除评论？",
	deleteDescription: "该评论将被永久删除。",
	attach: "添加附件",
	removeFile: "移除 {{filename}}",
	reply: "回复",
	replyingTo: "正在回复 {{name}}",
	replyPlaceholder: "回复 {{name}}…",
	cancelReply: "取消回复",
	resolve: "解决",
	reopen: "重新打开",
	resolved: "已解决",
	addReaction: "添加表情",
	reactionToggle: "切换 {{emoji}} 表情（{{count}}）",
	mentionEmpty: "没有匹配的成员",
	orphanReply: "原评论未加载或已删除",
	deepLinkMissing: "找不到链接指向的评论，可能已被删除。",
};

export default comments;
