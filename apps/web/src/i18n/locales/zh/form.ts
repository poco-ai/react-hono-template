import type en from "../en";

const form: typeof en.form = {
	errors: {
		required: "必填项",
		email: "请输入有效的邮箱地址",
		passwordMin: "密码至少需要 {{count}} 个字符",
		slugPattern: "只能使用小写字母、数字和连字符",
		identifierPattern: "标识必须为 2–6 个大写字母",
		url: "请输入有效的 URL（https，localhost 可用 http）",
		maxLength: "最多不超过 {{count}} 个字符",
		minLength: "至少需要 {{count}} 个字符",
		min: "不能小于 {{count}}",
		max: "不能大于 {{count}}",
		invalidFormat: "请输入有效的值",
		invalidValue: "请选择有效的选项",
		invalidNumber: "请输入有效的数字",
	},
};

export default form;
