import type en from "../en";

const emailOtp: typeof en.emailOtp = {
	title: "使用邮箱验证码登录",
	emailCode: "邮箱验证码",
	sendCode: "发送验证码",
	code: "验证码",
	verifyCode: "验证验证码",
	codeSentTo: "验证码已发送至 {{email}}",
	codeLengthMismatch: "请输入 {{length}} 位验证码",
	useDifferentEmail: "使用其他邮箱",
};

export default emailOtp;
