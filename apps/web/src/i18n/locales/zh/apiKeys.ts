import type en from "../en";

const apiKeys: typeof en.apiKeys = {
	create: "新建 API 密钥",
	createTitle: "创建 API 密钥",
	createDescription: "给密钥起一个易于辨认的名字，随时可以撤销。",
	name: "名称",
	namePlaceholder: "例如：CI 流水线",
	access: "访问级别",
	accessRead: "只读",
	accessWrite: "读写",
	accessReadDescription: "推荐用于不应修改数据的 MCP Agent 和集成。",
	accessWriteDescription: "允许创建和更新事项、评论和项目。",
	key: "密钥",
	created: "创建时间",
	lastUsed: "最近使用",
	lastUsedNever: "从未使用",
	statusActive: "有效",
	statusRevoked: "已撤销",
	revoke: "撤销",
	revokeTitle: "撤销 API 密钥？",
	revokeDescription: "{{name}} 将立即失效，此操作不可撤销。",
	createdTitle: "API 密钥已创建",
	secretWarning: "请立即复制该密钥——它不会再次显示。",
	viewDocs: "查看 API 文档",
	keyCount_one: "{{count}} 个密钥",
	keyCount_other: "{{count}} 个密钥",
	unknownCreator: "未知用户",
	empty: "还没有 API 密钥。",
};

export default apiKeys;
