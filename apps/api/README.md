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
