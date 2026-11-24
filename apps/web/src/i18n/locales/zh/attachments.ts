import type en from "../en";

const attachments: typeof en.attachments = {
	megabytes: "{{value}} MB",
	title: "附件",
	add: "添加文件",
	dropHint: "拖放文件到此处，或点击选择文件",
	typeLimit:
		"支持 PNG、JPEG、WebP、GIF、PDF、TXT、Markdown、ZIP，最大 {{size}}",
	typeNotAllowed: "“{{filename}}” 的文件类型不支持。",
	tooLarge: "“{{filename}}” 超过了当前套餐允许的大小。",
	uploadFailed: "上传“{{filename}}”失败。",
	uploading: "正在上传 {{filename}}…",
	cancelled: "“{{filename}}” 的上传已取消。",
	deleteTitle: "删除附件？",
	deleteDescription: "“{{filename}}” 将被永久删除。",
	storageUnavailable: "无法连接文件存储服务，请检查 S3 配置。",
	quotaExceeded: "组织已达到存储空间或附件数量上限。",
};

export default attachments;
