import type en from "../en";

const adminUsers: typeof en.adminUsers = {
	title: "用户管理",
	roles: {
		admin: "管理员",
		user: "用户",
	},
	banTitle: "封禁该用户？",
	banDescription: "{{name}} 将立即失去访问权限且无法再登录。",
	description: "管理平台上的所有用户账号。",
	searchPlaceholder: "按姓名或邮箱搜索…",
	user: "用户",
	status: "状态",
	created: "创建时间",
	actions: "操作",
	banned: "已封禁",
	bannedWithReason: "已封禁：{{reason}}",
	active: "正常",
	ban: "封禁",
	unban: "解封",
	selfBanTooltip: "不能封禁自己",
	userCount: "{{total}} 个用户",
};

export default adminUsers;
