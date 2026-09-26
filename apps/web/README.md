# Web (Vite SPA on Cloudflare Workers)

## 本地开发

```sh
bun install
bun run dev
```

Vite 开发服务器在 http://localhost:5173，`/api` 请求自动代理到本地 Workers（`apps/api`，端口 8787）。

## 部署

```sh
bun run deploy
```

构建并部署为 Workers 静态资源站点，线上地址：https://react-hono-web.chenqiyuan1012.workers.dev

前端调用后端 API 时，使用构建时注入的 `import.meta.env.VITE_API_URL`。
