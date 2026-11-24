import type en from "../en";

const securityUi: typeof en.securityUi = {
	activeSessions: "活跃会话",
	currentSession: "当前会话",
	revoke: "撤销",
	revokeSession: "撤销会话",
	revokeSessionSuccess: "会话已撤销",
	linkedAccounts: "关联账户",
	accountUnlinked: "已取消账户关联",
	lastAccountUnlinkingDisabled: "请至少保留一种登录方式。",
	link: "关联",
	linkProvider: "关联 {{provider}}",
	unlinkProvider: "取消关联 {{provider}}",
	signOutEverywhere: "退出所有设备",
	signOutEverywhereDescription: "退出所有会话，包括当前设备。",
	signOutOtherDevices: "退出其他设备",
	signOutOtherDevicesDescription: "结束除当前设备外的所有会话。",
	signOutOtherDevicesSuccess: "已退出其他设备",
	reauthenticationTitle: "重新登录",
	reauthenticationDescription: "请重新登录以继续此操作。",
	reauthenticationAction: "重新登录",
	unknownBrowser: "未知浏览器",
	appearance: "外观",
};

export default securityUi;
