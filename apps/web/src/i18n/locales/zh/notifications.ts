import type en from "../en";

const notifications: typeof en.notifications = {
	title: "收件箱",
	filterLabel: "通知筛选",
	tabs: {
		all: "全部",
		unread: "未读",
	},
	markAllRead: "全部标记为已读",
	markRead: "标记为已读",
	archive: "归档",
	openNotification: "打开通知",
	unknownActor: "某位成员",
	loadError: "无法加载通知",
	empty: "收件箱已清空。",
	emptyUnread: "没有未读通知。",
	emptyDescription: "新的指派、提及和回复会出现在这里。",
	actions: {
		issue_assigned: "将你指派到",
		issue_status_changed: "更新了状态：",
		issue_commented: "评论了",
		comment_reply: "回复了你在下面的评论：",
		comment_mention: "在评论中提到了你：",
		comment_resolved: "将评论标记为已解决：",
		recurring_issue_created: "自动创建了周期事项",
	},
	subscription: {
		subscribe: "订阅该事项",
		unsubscribe: "取消订阅该事项",
		subscribedToast: "已订阅该事项。",
		unsubscribedToast: "已取消订阅该事项。",
	},
	toast: {
		allRead: "所有通知已标记为已读。",
		archived: "通知已归档。",
	},
};

export default notifications;
