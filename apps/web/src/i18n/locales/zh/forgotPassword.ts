import type en from "../en";

const forgotPassword: typeof en.forgotPassword = {
	title: "重置密码",
	description: "我们会把重置链接发送到你的邮箱。",
	submit: "发送重置链接",
	sent: "如果该邮箱存在，重置链接已发送。",
	backToLogin: "返回登录",
	devHint: "当前实例未配置邮件服务，重置链接已输出到服务端日志。",
};

export default forgotPassword;
