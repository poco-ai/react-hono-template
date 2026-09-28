import type en from "./en";

const zh: typeof en = {
	common: {
		email: "邮箱",
		password: "密码",
		name: "姓名",
		role: "角色",
		emailPlaceholder: "you@example.com",
		loading: "加载中…",
		failedToLoad: "加载失败",
		error: "错误",
	},
	nav: {
		home: "首页",
		users: "用户",
		signOut: "退出登录",
	},
	login: {
		title: "登录",
		description: "输入邮箱和密码继续。",
		submit: "登录",
		noAccount: "还没有账号？",
		registerLink: "注册",
		failed: "登录失败",
	},
	register: {
		title: "创建账号",
		description: "第一个注册的用户将成为管理员。",
		namePlaceholder: "你的名字",
		passwordPlaceholder: "至少 8 个字符",
		submit: "注册",
		haveAccount: "已有账号？",
		signInLink: "登录",
		failed: "注册失败",
	},
	home: {
		signedIn: "已登录",
		sessionDescription: "你的会话，由 better-auth 签发。",
		userId: "用户 ID",
		rpcTitle: "RPC 演示",
		rpcDescription: "通过 Vite /api 代理的端到端类型化调用。",
		refetch: "重新请求",
		triggerError: "触发 API 错误",
		storageTitle: "对象存储演示",
		storageDescription:
			"预签名直传 S3 兼容存储（R2）—— 文件字节完全不经过 Worker。",
		uploading: "上传中…",
		uploadedPreviewAlt: "上传预览",
	},
	adminUsers: {
		title: "用户管理",
		description:
			"仅管理员可访问，由 RBAC 权限保护。分页与搜索状态保存在 URL 中。",
		searchPlaceholder: "按姓名或邮箱搜索…",
		search: "搜索",
		user: "用户",
		status: "状态",
		created: "创建时间",
		actions: "操作",
		banned: "已封禁",
		bannedWithReason: "已封禁：{{reason}}",
		active: "正常",
		ban: "封禁",
		unban: "解封",
		userCount: "{{total}} 个用户",
		pageIndicator: "第 {{page}} / {{total}} 页",
		prev: "上一页",
		next: "下一页",
		noUsers: "未找到用户。",
	},
	notFound: {
		message: "404 — 页面不存在。",
	},
	theme: {
		toggle: "切换主题",
		light: "浅色",
		dark: "深色",
		system: "跟随系统",
	},
	language: {
		toggle: "切换语言",
	},
};

export default zh;
