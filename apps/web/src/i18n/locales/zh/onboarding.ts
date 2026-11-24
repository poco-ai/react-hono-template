import type en from "../en";

const onboarding: typeof en.onboarding = {
	title: "创建你的组织",
	description: "这将是你和团队的工作空间。",
	verifyEmailTitle: "验证你的邮箱",
	verifyEmailDescription: "验证后才能查看待处理邀请并使用账号恢复。",
	verifyEmailAction: "发送验证邮件",
	orgName: "组织名称",
	orgNamePlaceholder: "例如：Acme 公司",
	slug: "Slug",
	slugPlaceholder: "acme-inc",
	slugHint: "小写字母、数字和连字符。",
	submit: "创建组织",
	failed: "创建组织失败",
	invitationsTitle: "待处理的邀请",
	invitationFrom: "{{inviter}} 邀请你加入 {{org}}。",
	join: "加入 {{org}}",
	orCreate: "或创建你自己的组织",
};

export default onboarding;
