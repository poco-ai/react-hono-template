import type en from "../en";

const members: typeof en.members = {
	member: "成员",
	searchPlaceholder: "搜索成员…",
	noResults: "无匹配成员",
	invite: "邀请成员",
	inviteDescription: "创建邀请后，把链接分享给你的队友。",
	inviteLinkTitle: "邀请已创建",
	inviteLinkDescription:
		"把这个链接发给 {{email}} —— 对方登录后即可加入，链接 2 天内有效。",
	roles: {
		owner: "所有者",
		admin: "管理员",
		member: "成员",
	},
	removeTitle: "移除成员？",
	removeDescription: "{{name}} 将失去该组织的访问权限。之后可以重新邀请。",
	selfRemoveTooltip: "不能移除自己",
	selfRoleTooltip: "不能修改自己的角色",
	lastOwnerTooltip: "组织必须保留至少一名所有者",
	pendingTitle: "待处理邀请",
	noPending: "没有待处理的邀请。",
	status: "状态",
	statusPending: "待处理",
	revoke: "撤销",
	revokeTitle: "撤销邀请？",
	revokeDescription: "对方将无法再通过此链接加入。",
};

export default members;
