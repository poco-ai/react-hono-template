import type en from "../en";

const quota: typeof en.quota = {
	upgrade: "升级",
	title: "用量与积分",
	description:
		"每只表计先用自己的包含量。共享积分只补足共享或混合模式下超出的部分。",
	credits: "共享积分",
	available: "可用 {{available}}",
	reserved: "预占 {{reserved}}",
	included: "包含量",
	modeLabel: "模式",
	unlimited: "不限",
	mode: {
		independent: "独立",
		pooled: "共享",
		hybrid: "混合",
	},
	meters: {
		"ai.tokens": "AI Token",
		"storage.bytes": "存储",
	},
	units: {
		tokens: "token",
		bytes: "字节",
	},
};

export default quota;
