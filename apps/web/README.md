# Web

Vite + React，部署为 Cloudflare Workers 静态资源。从仓库根目录 `bun run dev` 会和 API 一起启动；只跑 Web 时：

```sh
bun install
bun run dev
```

开发服务器在 <http://localhost:5173>，`/api` 代理到本地 API（`:8787`）。

```sh
bun run deploy
```

线上示例：<https://react-hono-web.poco-ai.workers.dev>。请求 API 时用构建时注入的 `import.meta.env.VITE_API_URL`。

上线和目录约定见 [docs/部署.md](../../docs/部署.md)、[docs/架构.md](../../docs/架构.md)。
