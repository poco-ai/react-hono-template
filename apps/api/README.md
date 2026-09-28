# API (Hono on Cloudflare Workers)

## 本地开发

```sh
bun install
bun run dev
```

wrangler dev 会在 http://localhost:8787 启动本地 Workers 运行时（前端 `apps/web` 的 Vite 已配置把 `/api` 代理到这里）。

## 部署

```sh
bun run deploy
```

部署到 Cloudflare Workers，线上地址：https://react-hono-api.chenqiyuan1012.workers.dev

## 类型

修改 `wrangler.jsonc`（新增 binding 等）后重新生成运行时类型：

```sh
bun run cf-typegen
```

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
3. 浏览器直传需要给桶配置 CORS（Dashboard 或 `wrangler r2 bucket cors put <bucket> --file cors.json`）：

```json
[
	{
		"AllowedOrigins": [
			"http://localhost:5173",
			"https://react-hono-web.chenqiyuan1012.workers.dev"
		],
		"AllowedMethods": ["GET", "PUT", "DELETE"],
		"AllowedHeaders": ["content-type"],
		"ExposeHeaders": ["etag"],
		"MaxAgeSeconds": 3600
	}
]
```

### 接口与约定

附件上传走 issue 维度的预签名直传（org-scoped，见 `src/services/attachment.service.ts`）：

- `POST /api/orgs/:orgId/projects/:projectId/issues/:number/attachments/presign` `{ filename, contentType }` → `{ key, uploadUrl, expiresIn }`，客户端拿到 `uploadUrl` 后 `PUT` 直传（必须带签名时相同的 `Content-Type`），完成后 `POST .../attachments` 注册并落库（服务端 HEAD 校验大小与类型）
- `GET .../attachments` 返回附件列表及带签名的下载链接
- key 由服务端生成，固定为 `orgs/{orgId}/issues/{issueId}/{uuid}.{ext}`，注册时校验 key 归属，禁止跨组织/跨 issue 写入
