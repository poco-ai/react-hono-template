# API (Hono on Cloudflare Workers)

## 本地开发

```sh
bun install
bun run dev
```

wrangler dev 会在 http://localhost:8787 启动本地 Workers 运行时（前端 `apps/web` 的 Vite 已配置把 `/api` 代理到这里）。

Google / GitHub 登录是可选的：只有 client id 和 client secret 都非空时才会注册该提供方，缺任何一个则对应按钮不显示。本地社交登录可设置 `BETTER_AUTH_URL=http://localhost:5173`，让提供方跳回 Vite 源站，再由 `/api` 代理到 Worker。如果同时启用 MCP OAuth，请改用 API 源站（本地 `http://localhost:8787`），这样 issuer、JWKS 与 MCP resource 的 audience 才能一致；此时社交回调也指向 API 源站。回调路径为 `${BETTER_AUTH_URL}/api/auth/callback/github` 与 `${BETTER_AUTH_URL}/api/auth/callback/google`。生产环境的 `BETTER_AUTH_URL` 用 API 源站。

邮箱验证码登录使用 better-auth 的 `emailOTP` 插件，验证码为 6 位、5 分钟内有效，通过 Resend 发送；`disableSignUp: true`，因此只有已存在的账号可以登录（未注册邮箱不会收到邮件，也不会暴露账号是否存在）。配置以下变量后生效：

| 变量 | 说明 |
|---|---|
| `RESEND_API_KEY` | Resend API Key |
| `EMAIL_FROM` | Resend 中已验证的发件人，例如 `Acme <no-reply@example.com>` |

两者需同时配置（只配一个会报错）；缺省时验证码会写入 Worker 日志（`wrangler dev` 输出 / `wrangler tail`），仅适合本地开发；生产环境必须配置。

## 部署

```sh
bun run deploy
```

部署到 Cloudflare Workers，线上地址：https://react-hono-api.poco-ai.workers.dev

## 类型

修改 `wrangler.jsonc`（新增 binding 等）后重新生成运行时类型：

```sh
bun run cf-typegen
```

## KV 与运行时配置

KV binding 为 `KV`，namespace id 配置在 `wrangler.jsonc`；修改 binding 后运行 `bun run cf-typegen` 重新生成类型。本地 KV 由 `wrangler dev` 模拟，无需额外服务；部署前 namespace 必须已存在，CI 的 `CLOUDFLARE_API_TOKEN` 需要 Workers KV 权限。

运行时配置存放在 key `config:global`：服务内 L1 缓存 60s，KV 读取 `cacheTtl` 60s（下限 30s），写入不设过期时间。组织计划缓存在 `cache:v1:plan:<orgId>`，回退 TTL 1 小时，并在账单变更（checkout / portal / Stripe webhook）时显式失效；显式失效覆盖正常变更，长 TTL 只是省 KV 写入配额的回退手段。本地可写入初始值：

```sh
bunx wrangler kv key put --binding=KV "config:global" '{"version":1,"maintenance":false,"announcement":null,"features":{}}' --local
```

- `GET /api/config` — 公开读取（响应带 `Cache-Control: public, max-age=60`）
- `PUT /api/admin/config` — 平台管理员写入完整配置（`version`、`maintenance`、`announcement`、`features`）

配置可公开读取，禁止存放密钥或任何敏感信息。

Label 列表缓存于 `cache:v1:labels:<orgId>`（org id 经 `encodeURIComponent` 编码），回退 TTL 1 小时；label 创建/更新/删除成功后显式失效，长 TTL 只是省 KV 写入配额的回退手段。

## 对象存储（S3 协议，R2 / MinIO / OSS 通用）

附件存储基于 S3 协议实现（`aws4fetch` 签名 SigV4），实际厂商只由环境变量决定，换厂商零代码改动：

| 变量 | 说明 | R2 示例 |
|---|---|---|
| `S3_ENDPOINT` | S3 兼容 endpoint | `https://<accountId>.r2.cloudflarestorage.com` |
| `S3_REGION` | 区域 | `auto` |
| `S3_ACCESS_KEY_ID` | Access Key | R2 API Token 的 Access Key ID |
| `S3_SECRET_ACCESS_KEY` | Secret Key | R2 API Token 的 Secret Access Key |
| `S3_BUCKET` | 桶名 | `my-bucket` |
| `S3_PUBLIC_BASE_URL` | 可选，公开读自定义域 | `https://cdn.example.com` |

本地放到 `.dev.vars`，生产用 `bunx wrangler secret put <NAME>`。未配置时服务可正常启动，附件相关接口返回 503。

### R2 开通步骤

1. Dashboard → R2 → 创建桶（建议 dev/prod 分桶）
2. R2 → Manage API Tokens → 创建 token（Object Read & Write），得到 Access Key ID / Secret
3. 浏览器直传需要给桶配置 CORS（仓库已提供 `r2-cors.json`）：

```sh
wrangler r2 bucket cors set <bucket> --file r2-cors.json
```

Wrangler 的 CORS 文件使用 Cloudflare 格式（`rules` + `allowed`），不是 AWS S3 的 `AllowedOrigins` 写法：

```json
{
	"rules": [
		{
			"allowed": {
				"origins": [
					"http://localhost:5173",
					"https://react-hono-web.poco-ai.workers.dev"
				],
				"methods": ["GET", "PUT", "DELETE", "HEAD"],
				"headers": ["content-type"]
			},
			"exposeHeaders": ["etag"],
			"maxAgeSeconds": 3600
		}
	]
}
```

### 接口与约定

附件上传走 issue 维度的预签名直传（org-scoped，见 `src/services/attachment.service.ts`）：

- `POST /api/orgs/:orgId/projects/:projectId/issues/:number/attachments/presign` `{ filename, contentType }` → `{ key, uploadUrl, expiresIn }`，客户端拿到 `uploadUrl` 后 `PUT` 直传（必须带签名时相同的 `Content-Type`），完成后 `POST .../attachments` 注册并落库（服务端 HEAD 校验大小与类型）
- `GET .../attachments` 返回附件列表及带签名的下载链接
- key 由服务端生成，固定为 `orgs/{orgId}/issues/{issueId}/{uuid}.{ext}`，注册时校验 key 归属，禁止跨组织/跨 issue 写入
