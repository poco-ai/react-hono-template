const notifications = {
	title: "Inbox",
	filterLabel: "Notification filter",
	tabs: {
		all: "All",
		unread: "Unread",
	},
	markAllRead: "Mark all as read",
	markRead: "Mark as read",
	archive: "Archive",
	openNotification: "Open notification",
	unknownActor: "Someone",
	loadError: "Could not load notifications",
	empty: "Inbox zero.",
	emptyUnread: "No unread notifications.",
	emptyDescription: "New assignments, mentions and replies will show up here.",
	actions: {
		issue_assigned: "assigned you to",
		issue_status_changed: "updated the status of",
		issue_commented: "commented on",
		comment_reply: "replied to your comment on",
		comment_mention: "mentioned you in a comment on",
		comment_resolved: "resolved a comment on",
		recurring_issue_created: "created a recurring issue",
	},
	subscription: {
		subscribe: "Subscribe to issue",
		unsubscribe: "Unsubscribe from issue",
		subscribedToast: "Subscribed to issue.",
		unsubscribedToast: "Unsubscribed from issue.",
	},
	toast: {
		allRead: "All notifications marked as read.",
		archived: "Notification archived.",
	},
};

export default notifications;
