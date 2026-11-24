import type en from "../en";

const resetPassword: typeof en.resetPassword = {
	title: "设置新密码",
	description: "为你的账号设置新密码。",
	submit: "更新密码",
	success: "密码已更新，请重新登录。",
	invalidToken: "该重置链接无效或已过期。",
	backToLogin: "返回登录",
};

export default resetPassword;
