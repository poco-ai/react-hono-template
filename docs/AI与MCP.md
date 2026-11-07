# AI 与 MCP

应用内助手（`/ai`，以及全局 `Cmd/Ctrl+J` 侧栏）和远程 MCP（`POST /mcp`）共用 `apps/api/src/capabilities` 里的一套能力。聊天适配器对接 AI SDK，MCP 适配器对接协议。鉴权、入参校验和输出裁剪都在能力执行器里，新增一个操作会同时出现在两边。

组织成员、角色、API Key 范围、组织是否冻结，都在这一层判断。适配器不再加一套权限。

## 对话

路由在 `/api/orgs/:orgId/ai/*`，走登录会话。`POST /ai/chat` 流式返回，并把用户消息、助手消息和工具调用记下来。写操作和删除会停下来等确认；确认回放会对照服务端存的调用和入参哈希。客户端不能塞系统消息。

会话详情只有创建者能看，管理员只能看汇总用量。

本地不想接模型时：`AI_ENABLED=true`，`AI_PROVIDER=mock`。要接真实模型：`AI_PROVIDER=openai-compatible`，并且 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 三个都有。模型需要支持工具调用和流式输出。密钥只在服务端，`/api/config` 不会把它返回去。

## MCP

`MCP_ENABLED=true`，并设置：

- `MCP_RESOURCE`：对外的 API 源站加 `/mcp`，同时是 OAuth audience
- `APP_WEB_URL`，以及登录页、同意页（默认 `/login`、`/consent`）

两种身份：

- API Key：`Authorization: Bearer sk_...`。Key 绑在一个组织上，范围是 `read` / `write` / `admin`
- OAuth：better-auth 的 MCP + JWT，PKCE，JWKS 在 `/api/auth/...`。受保护资源元数据在 `/.well-known/oauth-protected-resource/mcp`。用户属于多个组织时要传 `orgId`，或先调 `list_orgs`

`tools/list` 按范围过滤，`tools/call` 会再鉴权一次。无人值守的客户端建议只用只读 Key。组织可以打开 `strict_mcp_writes`，进一步挡住 MCP 写入。

`MCP_DCR_ENABLED` 会打开免认证的动态客户端注册，只适合本地。生产用 CIMD，或事先登记客户端。

## 配额

Free / Pro 的 `aiMonthlyTokens`、`aiRequestsPerMinute`、`aiMaxSteps` 在 `packages/shared/src/plans.ts`。对话用量按组织、用户、自然日写进 D1，调用模型前检查。MCP 不扣 AI token，走套餐的 API 限流。

组织的 AI 设置页可以开关功能、选模型、设保留时间和严格写入。超过保留期的会话由定时任务清掉。

## Workers 上的约束

认证实例在每个 isolate 里懒创建。MCP OAuth 插件初始化时会写一条 `oauth_resource`，而 Workers 不允许在模块顶层做 D1 I/O。不要把 `createAuth` 挪回文件顶层。

工具调用的审计在 `ai_tool_calls`。`activities.source` / `source_id` 留给来源标记。
