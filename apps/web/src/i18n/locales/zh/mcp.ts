import type en from "../en";

const mcp: typeof en.mcp = {
	enabled: "已启用",
	disabled: "已禁用",
	disabledTitle: "MCP 已禁用",
	disabledDescription: "在 API Worker 上设置 MCP_ENABLED=true 后即可开放端点。",
	endpointTitle: "MCP 端点",
	endpointDescription: "将以下 URL 作为远程 MCP 服务地址，必须携带认证。",
	transport: "传输方式",
	apiKeyTitle: "API Key 接入",
	apiKeyDescription: "适合无头 Agent、脚本和 CI。创建密钥时选择所需 scope。",
	oauthTitle: "OAuth 接入",
	oauthDescription: "交互式客户端可以发现授权服务器，引导用户登录并授权。",
	dcr: "动态客户端注册",
	createKey: "管理 API 密钥",
	instructionsTitle: "连接说明",
	instructions: {
		apiKey:
			"创建具有所需 scope 的 API 密钥，并通过 Authorization: Bearer sk_... 发送。",
		oauth: "支持 OAuth 的客户端可以连接端点，并使用网页登录和授权页。",
		orgId:
			"组织级工具接受可选的 orgId。API 密钥固定在其组织；属于多个组织的 OAuth 调用方应先调用 list_orgs。",
	},
	adminOnly: "只有所有者和管理员可以创建 API 密钥或修改 MCP 设置。",
	securityTitle: "自动 Agent 建议使用只读密钥",
	securityDescription:
		"写入和删除工具受 scope 与审批保护，但无人值守 Agent 最安全的默认值是只读密钥。",
	snippet: "配置",
	consent: {
		title: "授权 MCP 客户端",
		description: "一个 MCP 客户端请求访问此工作区，请先确认请求的 scope。",
		unknownClient: "未知客户端",
		signInTitle: "需要登录",
		signInDescription: "请先登录账号，再批准此连接。",
		client: "客户端",
		scopes: "请求的 scope",
		noScopes: "未请求 scope",
		approve: "批准",
		deny: "拒绝",
		revokeHint: "如需撤销授权，请退出客户端或联系组织管理员移除连接。",
		failed: "无法完成授权请求。",
	},
};

export default mcp;
