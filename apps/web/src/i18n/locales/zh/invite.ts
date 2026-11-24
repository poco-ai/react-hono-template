import type en from "../en";

const invite: typeof en.invite = {
	title: "加入组织",
	accepting: "正在接受邀请…",
	successTitle: "加入成功！",
	successDescription: "邀请已被接受，你现在可以访问该组织了。",
	errorTitle: "接受邀请失败",
	continue: "继续",
	preview: "你被邀请以 {{role}} 的身份加入 {{organization}}。",
	errors: {
		invitationNotFound: "邀请不存在或已被撤销。",
		emailMismatch: "该邀请与当前邮箱不符。",
		alreadyMember: "你已是该组织成员。",
		orgFull: "当前方案的组织成员名额已满。",
		generic: "该邀请无效或已过期。",
	},
};

export default invite;
