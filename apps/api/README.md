# API

Hono，部署在 Cloudflare Workers。从仓库根目录 `bun run dev` 会和 Web 一起启动；只跑 API 时：

```sh
bun install
bun run dev
```

本地地址 <http://localhost:8787>。Web 的 Vite 把 `/api` 代理到这里。

```sh
bun run deploy
```

线上示例：<https://react-hono-api.poco-ai.workers.dev>

改了 `wrangler.jsonc` 的 binding 之后：

```sh
bun run cf-typegen
```

环境变量、R2、KV 和上线步骤在 [docs/环境变量.md](../../docs/环境变量.md) 和 [docs/部署.md](../../docs/部署.md)。
